/**
 * Rare-sticker finder — data layer for SkinsMonkey + PirateSwap.
 * Ported from sticker-raro-pirateswap-skinsmonkey/app.template.js.
 */
import { sleep } from '../shared/fmt';
import { t } from '../shared/i18n';
import { estimateCsMoneyOverpay } from '../shared/overpay';
import { patternKey } from './pattern-data';
import { getRareMap, lookup } from './rare-data';
import type { RareItem, RareResult, RareStickerMatch } from './types';

export type RareSite = 'skinsmonkey' | 'pirateswap';

/* ── Site fetchers ──────────────────────────────────────────────────── */
interface SmRawSticker {
  marketName?: string;
  price?: number;
  imageUrl?: string;
}
interface SmRawAsset {
  uniqueId?: string;
  assetId?: string;
  imageUrl?: string;
  item?: {
    marketName?: string;
    imageUrl?: string;
    price?: number;
    details?: { exterior?: string };
  };
  game730?: { inspectUrl?: string; stickers?: SmRawSticker[]; paintSeed?: number };
}
interface SmInventoryResp {
  assets?: SmRawAsset[];
}

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m && m[1] ? decodeURIComponent(m[1]) : null;
}

function getSmCsrf(): string | null {
  return (
    getCookie('csrf-token') ||
    getCookie('csrfToken') ||
    getCookie('XSRF-TOKEN') ||
    document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ||
    null
  );
}

async function fetchSm(offset: number, limit = 120, q?: string): Promise<SmInventoryResp> {
  const headers: Record<string, string> = { Accept: 'application/json, text/plain, */*' };
  const csrf = getSmCsrf();
  if (csrf) headers['x-csrf-token'] = csrf;
  const search = q ? `&q=${encodeURIComponent(q)}` : '';
  const url = `/api/inventory?limit=${limit}&offset=${offset}&appId=730&sort=price-desc&withStickers=true${search}`;
  const res = await fetch(url, { credentials: 'include', headers });
  if (!res.ok) throw new Error('SkinsMonkey HTTP ' + res.status);
  return res.json();
}

/**
 * Targeted name query (v0.9.1 Rare Pattern): every SkinsMonkey listing of ONE
 * skin, via the same `q` search the arbitrage scanner uses. Small by
 * construction; capped at 3 pages as a runaway guard.
 */
export async function collectSmByName(
  name: string,
  opts: { signal?: { aborted: boolean }; onPage?: (page: number) => void } = {},
): Promise<RareItem[]> {
  const limit = 120;
  const out: RareItem[] = [];
  for (let i = 0; i < 3; i++) {
    if (opts.signal?.aborted) break;
    opts.onPage?.(i + 1);
    const json = await fetchSm(i * limit, limit, name);
    const page = normalizeSm(json);
    out.push(...page);
    if (page.length < limit) break;
    await sleep(400);
  }
  return out;
}

export function normalizeSm(json: SmInventoryResp): RareItem[] {
  const out: RareItem[] = [];
  for (const a of json.assets ?? []) {
    const it = a.item ?? {};
    const g = a.game730 ?? {};
    const stickers = (g.stickers ?? []).map((s) => ({
      name: s.marketName ?? '',
      price: (s.price ?? 0) / 100,
      image: s.imageUrl ?? null,
    }));
    out.push({
      id: a.uniqueId ?? a.assetId ?? '',
      name: it.marketName ?? '',
      image: it.imageUrl ?? a.imageUrl ?? null,
      price: (it.price ?? 0) / 100,
      exterior: it.details?.exterior ?? '',
      inspectUrl: g.inspectUrl ?? '',
      marketHashName: it.marketName ?? '',
      stickers,
      paintSeed: typeof g.paintSeed === 'number' ? g.paintSeed : null,
    });
  }
  return out;
}

interface PsItem {
  id?: string;
  assetId?: string;
  marketHashName?: string;
  price?: number;
  exterior?: string;
  inspectInGameLink?: string;
  icon?: string;
  stickers?: Array<{ name?: string; imageUrl?: string }>;
  /** Paint seed (v0.9 Rare Pattern). */
  pattern?: number;
  /** Fade % already computed by PirateSwap. */
  fadePercentage?: number;
  /** Item category — "Knife" / "Gloves" / weapon class — for weapon-only filtering. */
  category?: string;
}
interface PsResp {
  items?: PsItem[];
  /** End-of-inventory signal — PS sets this to true on the page that
   *  trails the last item-bearing one. Authoritative; we trust it. */
  empty?: boolean;
  /** Reported but currently always 0 in our captures; logged in DEV only. */
  totalResults?: number;
  totalPages?: number;
}

async function fetchPs(page: number, results = 40): Promise<PsResp> {
  // `itemWithSticker=true` — restored after a "0 rare hits" report. The B5
  // investigation had flagged it as a no-op (response byte-identical), but
  // since 0 hits points at items arriving without stickers we put it back
  // while validating empirically (see the sticker-count diagnostic in the
  // PirateSwap content script). Cheap and reversible.
  //
  // sortOrder=DESC (most expensive first). PS throttles hard after ~60 pages
  // (returns HTTP 200 + empty body, no 429) and never clears within a scan, so
  // we only ever get one ~2.4k-item window. The value lives at the TOP — the
  // items worth flagging are expensive *because* of their stickers — so we walk
  // down from the most expensive. Walking up (ASC) burned the whole budget on
  // sub-$0.30 items and never reached anything valuable.
  const url = `https://web.pirateswap.com/inventory/v2/ExchangerInventory?orderBy=price&sortOrder=DESC&page=${page}&results=${results}&isSouvenir=false&itemWithSticker=true`;
  const res = await fetch(url, {
    credentials: 'omit',
    headers: { Accept: 'application/json, text/plain, */*' },
  });
  if (!res.ok) throw new Error('PirateSwap HTTP ' + res.status);
  return res.json();
}

export function normalizePs(json: PsResp): RareItem[] {
  const out: RareItem[] = [];
  for (const it of json.items ?? []) {
    const stickers = (it.stickers ?? []).map((s) => ({
      name: s.name ?? '',
      price: null,
      image: s.imageUrl ?? null,
    }));
    out.push({
      id: it.id ?? it.assetId ?? '',
      name: it.marketHashName ?? '',
      image: it.icon
        ? `https://community.cloudflare.steamstatic.com/economy/image/${it.icon}/256fx256f`
        : null,
      price: it.price ?? 0,
      exterior: it.exterior ?? '',
      inspectUrl: it.inspectInGameLink ?? '',
      marketHashName: it.marketHashName ?? '',
      stickers,
      paintSeed: typeof it.pattern === 'number' ? it.pattern : null,
      fadePercentage: typeof it.fadePercentage === 'number' ? it.fadePercentage : null,
      category: typeof it.category === 'string' ? it.category : null,
    });
  }
  return out;
}

/* ── PirateSwap query-by-name (v0.9.2) ──────────────────────────────── */

/**
 * PS's search endpoint ignores `searchPhrase` unless `marketHashNameHashCodes`
 * is also present — and those codes are NOT a derivable hash of the name
 * (tested: not Java/DJB2/FNV/CRC32/.NET). The site's own frontend resolves
 * them via `inventory/search/v2/autocomplete`, which returns
 * `marketNameHashCodes` per market hash name (one code per wear variant).
 * Two-step query: autocomplete → search. Verified live 2026-06-10.
 */
interface PsAutocompleteEntry {
  marketHashName?: string;
  marketNameHashCodes?: number[];
}

const PS_API = 'https://web.pirateswap.com';

async function fetchPsJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    credentials: 'omit',
    headers: { Accept: 'application/json, text/plain, */*' },
  });
  if (!res.ok) throw new Error('PirateSwap HTTP ' + res.status);
  return res.json() as Promise<T>;
}

/**
 * Resolve a bank skin name to PS hashcodes. The autocomplete returns separate
 * entries per prefix variant (plain / StatTrak™ / Souvenir); we keep every
 * entry whose normalized name matches ours — patterns apply to all variants.
 */
export async function psResolveHashCodes(name: string): Promise<number[]> {
  const url = `${PS_API}/inventory/search/v2/autocomplete?searchPhrase=${encodeURIComponent(name)}`;
  const entries = await fetchPsJson<PsAutocompleteEntry[]>(url);
  const key = patternKey(name);
  const codes: number[] = [];
  for (const e of entries ?? []) {
    if (patternKey(e.marketHashName ?? '') !== key) continue;
    for (const c of e.marketNameHashCodes ?? []) {
      if (typeof c === 'number' && Number.isFinite(c)) codes.push(c);
    }
  }
  return [...new Set(codes)];
}

/** Server-side listing filters PS supports on the search endpoint. */
export interface PsQueryFilter {
  /** Exact paint seeds — sent as repeated `pattern=` params (seed-list skins). */
  seeds?: number[];
  /** Minimum fade % — sent as `fadeFrom=` (fade-calc skins). */
  fadeFrom?: number;
}

/** Max seeds per request — keeps the URL well under server limits (Deagle
 *  Heat Treated has 276 bank seeds ≈ 3.3 KB of `pattern=` params unchunked). */
const PS_SEEDS_PER_CHUNK = 100;
/** Per-chunk page cap. Results are seed/fade-filtered server-side, so even one
 *  page is usually plenty; the cap is a runaway guard like collectSmByName's. */
const PS_QUERY_MAX_PAGES = 5;
const PS_QUERY_RETRIES = 2;
const PS_QUERY_BASE_DELAY_MS = 600;

/**
 * Targeted name query (v0.9.2 Rare Pattern): every PirateSwap listing of ONE
 * skin, seed/fade-filtered BY THE SERVER. Two-step: autocomplete resolves the
 * name to hashcodes, then the search endpoint pages each seed chunk. A skin
 * with no autocomplete entry (not stocked) returns [] without searching.
 */
export async function collectPsByName(
  name: string,
  filter: PsQueryFilter,
  opts: {
    signal?: { aborted: boolean };
    onPage?: (page: number) => void;
    /** Post-query telemetry: how many hashcodes resolved + whether any chunk
     *  gave up on a persistent throttle (coverage possibly partial). */
    onMeta?: (meta: { hashcodes: number; throttled: boolean }) => void;
  } = {},
): Promise<RareItem[]> {
  const codes = await psResolveHashCodes(name);
  if (!codes.length) {
    opts.onMeta?.({ hashcodes: 0, throttled: false });
    return [];
  }
  let throttled = false;

  const chunks: PsQueryFilter[] = [];
  if (filter.seeds?.length) {
    for (let i = 0; i < filter.seeds.length; i += PS_SEEDS_PER_CHUNK) {
      chunks.push({ seeds: filter.seeds.slice(i, i + PS_SEEDS_PER_CHUNK) });
    }
  } else {
    chunks.push(filter.fadeFrom != null ? { fadeFrom: filter.fadeFrom } : {});
  }

  const results = 40;
  const out: RareItem[] = [];
  let globalPage = 0;
  for (const chunk of chunks) {
    for (let p = 1; p <= PS_QUERY_MAX_PAGES; p++) {
      if (opts.signal?.aborted) return out;
      opts.onPage?.(++globalPage);
      const params = new URLSearchParams({
        orderBy: 'price',
        sortOrder: 'DESC',
        page: String(p),
        results: String(results),
        searchPhrase: name,
        marketHashNameHashCodes: codes.join(','),
      });
      for (const s of chunk.seeds ?? []) params.append('pattern', String(s));
      if (chunk.fadeFrom != null) params.set('fadeFrom', String(chunk.fadeFrom));

      // Flagless-empty = PS throttle (same behavior as the full scan); back
      // off and retry the same page a couple of times before giving up.
      let json: PsResp | null = null;
      for (let attempt = 0; attempt <= PS_QUERY_RETRIES; attempt++) {
        json = await fetchPsJson<PsResp>(`${PS_API}/inventory/v2/ExchangerInventory?${params}`);
        if (json.empty === true || (json.items ?? []).length > 0) break;
        if (attempt < PS_QUERY_RETRIES) {
          await sleep(PS_QUERY_BASE_DELAY_MS * 2 ** (attempt + 1));
        }
      }
      const page = normalizePs(json ?? {});
      out.push(...page);
      if (json?.empty === true || page.length < results) {
        // Retries exhausted on a flagless-empty page = stuck throttle, not a
        // confirmed end — flag it so the UI can say "possibly partial".
        if (json?.empty !== true && page.length === 0) throttled = true;
        break;
      }
      await sleep(PS_QUERY_BASE_DELAY_MS);
    }
  }
  opts.onMeta?.({ hashcodes: codes.length, throttled });
  return out;
}

/* ── Paged collection ───────────────────────────────────────────────── */
export interface CollectOpts {
  site: RareSite;
  /** SkinsMonkey only — ignored for PirateSwap (full-inventory scan). */
  maxPages?: number;
  onProgress?: (msg: string, collected: number) => void;
  /** Fires when an HTTP-200 response is missing the expected item key — the
   *  site likely changed its API; without this the scan degrades to a silent
   *  "0 items". Callers surface it as a persistent warning. */
  onWarn?: (msg: string) => void;
  signal?: { aborted: boolean };
}

/**
 * Safety cap on PirateSwap page count. Empirically the inventory runs out
 * between pages 100 and 200 (~4k-8k items); 250 doubles the high estimate
 * so a runaway server response doesn't pin us forever. We log a warning
 * if we hit it.
 */
export const PS_SAFETY_CAP_PAGES = 250;

export async function collectAll(opts: CollectOpts): Promise<RareItem[]> {
  const items: RareItem[] = [];
  const DEV = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
  if (opts.site === 'skinsmonkey') {
    const limit = 120;
    const maxPages = opts.maxPages ?? 80;
    for (let i = 0; i < maxPages; i++) {
      if (opts.signal?.aborted) break;
      opts.onProgress?.(t('scan.page', { i: i + 1, n: maxPages, off: i * limit }), items.length);
      try {
        const json = await fetchSm(i * limit, limit);
        // HTTP 200 with the item key missing entirely (an empty inventory is
        // `assets: []`) — the API likely changed shape; warn instead of
        // silently reporting "0 items".
        if (json.assets === undefined) opts.onWarn?.(t('scan.schemaWarn'));
        const page = normalizeSm(json);
        items.push(...page);
        if (page.length < limit) break;
      } catch (e) {
        opts.onProgress?.(t('scan.error', { msg: (e as Error).message }), items.length);
        break;
      }
      await sleep(400);
    }
  } else {
    // PirateSwap: scan to inventory end (or SAFETY_CAP), trust `empty` flag.
    // PS's totalResults / totalPages were observed as `0` in v0.4.1 captures
    // — we read them only for DEV logging, never for control.
    const results = 40;
    const BASE_DELAY_MS = 600;
    // PirateSwap throttles silently: when paged too fast it answers HTTP 200
    // with an empty `items` array and WITHOUT `empty:true`. The old loop read
    // that flagless-empty page as end-of-inventory and stopped — so an ASC scan
    // died at the cheap end (~page 65, ~$0.27) and never reached the items that
    // carry valuable stickers. We now end ONLY on the authoritative `empty:true`
    // flag (or an HTTP error); a flagless-empty page is treated as a throttle,
    // so we back off and retry the SAME page. A retry budget prevents an
    // infinite loop if PS is genuinely down / the throttle never clears.
    const MAX_EMPTY_RETRIES = 4;
    // Optional user cap (PS "Max pages"); blank → full scan. Never above the
    // safety cap, which always guards against a runaway response.
    const cap = Math.min(opts.maxPages ?? PS_SAFETY_CAP_PAGES, PS_SAFETY_CAP_PAGES);
    const startedAt = Date.now();
    let loggedHeader = false;
    let p = 1;
    for (; p <= cap; p++) {
      if (opts.signal?.aborted) break;
      opts.onProgress?.(t('scan.scannedPages', { p: p - 1, n: items.length }), items.length);

      let page: RareItem[] = [];
      let ended = false;
      let httpError = false;
      for (let attempt = 0; attempt <= MAX_EMPTY_RETRIES; attempt++) {
        let json: PsResp;
        try {
          json = await fetchPs(p, results);
        } catch (e) {
          opts.onProgress?.(t('scan.error', { msg: (e as Error).message }), items.length);
          httpError = true;
          break;
        }
        if (DEV && !loggedHeader) {
          console.debug(
            `[Skinsight] PS scan started — totalResults=${json.totalResults ?? '?'} totalPages=${json.totalPages ?? '?'} (PS often reports 0; ignored)`,
          );
          loggedHeader = true;
        }
        if (json.items === undefined && json.empty !== true) opts.onWarn?.(t('scan.schemaWarn'));
        page = normalizePs(json);
        if (json.empty === true) {
          ended = true; // authoritative last batch (may still carry items)
          break;
        }
        if (page.length > 0) break; // got data — proceed to next page
        // Flagless empty → PS throttle. Back off (exponential) and retry.
        if (attempt < MAX_EMPTY_RETRIES) {
          const backoff = BASE_DELAY_MS * 2 ** (attempt + 1); // 1.2s,2.4s,4.8s,9.6s
          opts.onProgress?.(t('ps.throttle', { s: (backoff / 1000).toFixed(1), p }), items.length);
          await sleep(backoff);
        }
      }

      if (httpError) break;
      items.push(...page);
      if (ended) {
        p++;
        break;
      }
      // Exhausted retries and still flagless-empty: can't distinguish a stuck
      // throttle from a true end, so bail (terminates; never spins forever).
      if (page.length === 0) {
        if (DEV) {
          console.warn(
            `[Skinsight] PS page ${p} still empty after ${MAX_EMPTY_RETRIES} retries — ending scan (persistent throttle or true end).`,
          );
        }
        p++;
        break;
      }
      await sleep(BASE_DELAY_MS);
    }
    if (p > PS_SAFETY_CAP_PAGES && DEV) {
      console.warn(
        `[Skinsight] PS safety cap (${PS_SAFETY_CAP_PAGES} pages) reached — inventory may be incomplete`,
      );
    }
    if (DEV) {
      console.debug(
        `[Skinsight] PS scan completed: ${p - 1} pages, ${items.length} items in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
      );
    }
  }
  return items;
}

/* ── Match + score ──────────────────────────────────────────────────── */

/**
 * Yield to the event loop only after a chunk has actually hogged the main
 * thread this long (ms). Time-based, NOT count-based: matching is cheap
 * (~Map lookups), so a fixed "yield every N items" sprinkled ~50 setTimeout(0)
 * calls across a big scan. Background tabs throttle setTimeout to ~1/min, which
 * turned those 50 yields into a ~50-minute "stuck on Matching…" hang. Yielding
 * by elapsed CPU time instead caps real work at ~one frame between repaints and
 * keeps the yield count to single digits even for a 10k-item inventory.
 */
const YIELD_EVERY_MS = 50;

/** Yield control to the event loop so the UI can repaint between chunks. */
function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Build the result set. `mapOverride` lets tests inject a deterministic
 * map without going through chrome.runtime.getURL + fetch.
 *
 * v0.4.1: yields to the main thread so a big PS scan doesn't freeze the
 * overlay. The yield is TIME-based (see YIELD_EVERY_MS) — a count-based yield
 * fired ~50 setTimeout(0)s that a backgrounded tab throttled into a ~50-minute
 * "stuck on Matching…" hang. The function is genuinely async — earlier versions
 * declared async but ran a single synchronous loop.
 */
export async function findRareResults(
  items: RareItem[],
  mapOverride?: Map<string, number>,
): Promise<RareResult[]> {
  const map = mapOverride ?? (await getRareMap());
  const out: RareResult[] = [];
  let lastYield = Date.now();
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const matches: RareStickerMatch[] = [];
    for (const s of it.stickers) {
      const ref = lookup(map, s.name);
      if (ref != null) {
        matches.push({
          name: s.name,
          image: s.image,
          itemPrice: s.price,
          refMinPrice: ref,
        });
      }
    }
    if (matches.length) {
      const stickerSum = matches.reduce((sum, m) => sum + (m.refMinPrice || 0), 0);
      const profit = stickerSum - (it.price || 0);
      const roi = it.price > 0 ? stickerSum / it.price : 0;
      const csMoneyOverpayEst = estimateCsMoneyOverpay(stickerSum, it.price || 0);
      out.push({ ...it, matches, stickerSum, profit, roi, csMoneyOverpayEst });
    }
    // Yield only after we've actually held the thread for a frame's worth of
    // work — keeps the yield count in single digits regardless of item count.
    if (i + 1 < items.length && Date.now() - lastYield >= YIELD_EVERY_MS) {
      await nextTick();
      lastYield = Date.now();
    }
  }
  return out;
}

export type RareSortKey = 'roi' | 'stickerSum' | 'profit' | 'priceAsc' | 'priceDesc';

export interface RareFilterOpts {
  maxPrice?: number;
  minRoiPct?: number;
  minStickers?: number;
  sort?: RareSortKey;
}

export function applyRareFilter(results: RareResult[], f: RareFilterOpts): RareResult[] {
  const minRoi = (f.minRoiPct ?? 0) / 100;
  const minStickers = f.minStickers ?? 0;
  const maxPrice = f.maxPrice;
  const arr = results.filter((r) => {
    if (maxPrice != null && r.price > maxPrice) return false;
    if (r.roi < minRoi) return false;
    if (r.stickerSum < minStickers) return false;
    return true;
  });
  const cmps: Record<RareSortKey, (a: RareResult, b: RareResult) => number> = {
    roi: (a, b) => b.roi - a.roi,
    stickerSum: (a, b) => b.stickerSum - a.stickerSum,
    profit: (a, b) => b.profit - a.profit,
    priceAsc: (a, b) => a.price - b.price,
    priceDesc: (a, b) => b.price - a.price,
  };
  arr.sort(cmps[f.sort ?? 'roi']);
  return arr;
}
