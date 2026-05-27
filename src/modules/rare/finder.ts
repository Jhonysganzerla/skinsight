/**
 * Rare-sticker finder — data layer for SkinsMonkey + PirateSwap.
 * Ported from sticker-raro-pirateswap-skinsmonkey/app.template.js.
 */
import { sleep } from '../shared/fmt';
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
  game730?: { inspectUrl?: string; stickers?: SmRawSticker[] };
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

async function fetchSm(offset: number, limit = 120): Promise<SmInventoryResp> {
  const headers: Record<string, string> = { Accept: 'application/json, text/plain, */*' };
  const csrf = getSmCsrf();
  if (csrf) headers['x-csrf-token'] = csrf;
  const url = `/api/inventory?limit=${limit}&offset=${offset}&appId=730&sort=price-desc&withStickers=true`;
  const res = await fetch(url, { credentials: 'include', headers });
  if (!res.ok) throw new Error('SkinsMonkey HTTP ' + res.status);
  return res.json();
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
  const url = `https://web.pirateswap.com/inventory/v2/ExchangerInventory?orderBy=price&sortOrder=ASC&page=${page}&results=${results}&isSouvenir=false&itemWithSticker=true`;
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
    });
  }
  return out;
}

/* ── Paged collection ───────────────────────────────────────────────── */
export interface CollectOpts {
  site: RareSite;
  /** SkinsMonkey only — ignored for PirateSwap (full-inventory scan). */
  maxPages?: number;
  onProgress?: (msg: string, collected: number) => void;
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
      opts.onProgress?.(`Page ${i + 1}/${maxPages} (offset ${i * limit})…`, items.length);
      try {
        const json = await fetchSm(i * limit, limit);
        const page = normalizeSm(json);
        items.push(...page);
        if (page.length < limit) break;
      } catch (e) {
        opts.onProgress?.('Error: ' + (e as Error).message, items.length);
        break;
      }
      await sleep(400);
    }
  } else {
    // PirateSwap: scan to inventory end (or SAFETY_CAP), trust `empty` flag.
    // PS's totalResults / totalPages were observed as `0` in v0.4.1 captures
    // — we read them only for DEV logging, never for control.
    const results = 40;
    const startedAt = Date.now();
    let p = 1;
    let loggedHeader = false;
    for (; p <= PS_SAFETY_CAP_PAGES; p++) {
      if (opts.signal?.aborted) break;
      opts.onProgress?.(`Scanned ${p - 1} pages (${items.length} items)…`, items.length);
      let json: PsResp;
      try {
        json = await fetchPs(p, results);
      } catch (e) {
        opts.onProgress?.('Error: ' + (e as Error).message, items.length);
        break;
      }
      if (DEV && !loggedHeader) {
        console.debug(
          `[Skinsight] PS scan started — totalResults=${json.totalResults ?? '?'} totalPages=${json.totalPages ?? '?'} (PS often reports 0; ignored)`,
        );
        loggedHeader = true;
      }
      const page = normalizePs(json);
      items.push(...page);
      // Authoritative end signal. Some captures show empty=true *with* items
      // on the same page; we still treat empty=true as the last batch.
      const lastBatch = json.empty === true || page.length === 0;
      if (lastBatch) {
        p++;
        break;
      }
      await sleep(250);
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

/** How many items to process per main-thread tick before yielding. */
const FIND_CHUNK_SIZE = 100;

/** Yield control to the event loop so the UI can repaint between chunks. */
function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Build the result set. `mapOverride` lets tests inject a deterministic
 * map without going through chrome.runtime.getURL + fetch.
 *
 * v0.4.1: yields to the main thread every `FIND_CHUNK_SIZE` items so a
 * 2000-item PS scan no longer freezes the overlay for ~hundreds of ms.
 * The function is genuinely async now — earlier versions declared async
 * but ran a single synchronous loop.
 */
export async function findRareResults(
  items: RareItem[],
  mapOverride?: Map<string, number>,
): Promise<RareResult[]> {
  const map = mapOverride ?? (await getRareMap());
  const out: RareResult[] = [];
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
      out.push({ ...it, matches, stickerSum, profit, roi });
    }
    if ((i + 1) % FIND_CHUNK_SIZE === 0 && i + 1 < items.length) {
      await nextTick();
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
