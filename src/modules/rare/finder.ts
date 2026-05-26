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
  maxPages: number;
  onProgress?: (msg: string, collected: number) => void;
  signal?: { aborted: boolean };
}

export async function collectAll(opts: CollectOpts): Promise<RareItem[]> {
  const items: RareItem[] = [];
  if (opts.site === 'skinsmonkey') {
    const limit = 120;
    for (let i = 0; i < opts.maxPages; i++) {
      if (opts.signal?.aborted) break;
      opts.onProgress?.(`Page ${i + 1}/${opts.maxPages} (offset ${i * limit})…`, items.length);
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
    const results = 40;
    const cap = Math.min(opts.maxPages || 2000, 2000);
    for (let p = 1; p <= cap; p++) {
      if (opts.signal?.aborted) break;
      opts.onProgress?.(`Page ${p} — ${items.length} collected…`, items.length);
      try {
        const json = await fetchPs(p, results);
        const page = normalizePs(json);
        items.push(...page);
        if (page.length < results) break;
      } catch (e) {
        opts.onProgress?.('Error: ' + (e as Error).message, items.length);
        break;
      }
      await sleep(400);
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
