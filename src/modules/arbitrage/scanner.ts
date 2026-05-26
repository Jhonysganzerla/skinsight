/**
 * SkinsMonkey scanner — data layer (UI lives in content/skinsmonkey.ts).
 * Ported from busca_pattern_cs2/src/builder.js. Public ops:
 *   - getCsrf()
 *   - fetchPage()
 *   - applyFilter()
 *   - buildExportPayload()
 *   - fetchAccessoryPrices() — pulls Steam Market prices via background-allowed origin
 */
import { sleep } from '../shared/fmt';
import type { ArbitrageItem, ExportPayload } from './types';
import { getDefIndex } from './csf-url';

/* ── Raw shapes returned by SkinsMonkey /api/inventory ───────────────── */
interface RawSticker {
  marketName?: string;
}
interface RawKeychain {
  marketName?: string;
  pattern?: number | string;
  imageUrl?: string;
}
interface RawGame730 {
  paintSeed?: number;
  paintWear?: number;
  paintIndex?: number;
  inspectUrl?: string;
  screenshotUrl?: string;
  stickers?: RawSticker[];
  keychains?: RawKeychain[];
}
interface RawItemDetails {
  exterior?: string;
  statTrak?: boolean;
  souvenir?: boolean;
}
interface RawItem {
  marketName?: string;
  price?: number;
  imageUrl?: string;
  details?: RawItemDetails;
}
export interface RawAsset {
  assetId?: string;
  id?: string;
  uniqueId?: string;
  imageUrl?: string;
  tradeLock?: boolean;
  tradableAfter?: string | null;
  item?: RawItem;
  game730?: RawGame730;
}
interface InventoryResponse {
  assets?: RawAsset[];
  total?: number;
}

/* ── CSRF detection — multiple fallbacks (cookie, meta, Nuxt globals) ─ */
export function getCsrf(): string {
  const ck = document.cookie;
  const m1 =
    ck.match(/x-csrf-token=([a-f0-9]{40,})/i) ||
    ck.match(/csrf[^=]*=([a-f0-9]{40,})/i) ||
    ck.match(/xsrf[^=]*=([^;]{20,})/i);
  if (m1 && m1[1]) return decodeURIComponent(m1[1]);
  const mt = document.querySelector<HTMLMetaElement>(
    'meta[name="csrf-token"],meta[name="_csrf"],meta[name="x-csrf-token"]',
  );
  if (mt?.content) return mt.content;
  try {
    for (const n of ['__NUXT__', '__nuxt__', '$nuxt'] as const) {
      const w = (window as unknown as Record<string, unknown>)[n];
      if (!w) continue;
      const m = JSON.stringify(w).match(/"(?:csrf|xsrf)[^"]*"\s*:\s*"([a-f0-9]{40,})"/i);
      if (m && m[1]) return m[1];
    }
  } catch {
    /* ignore */
  }
  try {
    for (const sc of document.querySelectorAll('script:not([src])')) {
      const m = (sc.textContent ?? '').match(/(?:csrf|xsrf)[^"']*[=:]\s*['"]([a-f0-9]{40,})['"]/i);
      if (m && m[1]) return m[1];
    }
  } catch {
    /* ignore */
  }
  return '';
}

/* ── /api/inventory paging ───────────────────────────────────────────── */
export async function fetchPage(
  q: string,
  exteriors: string[],
  offset: number,
  csrf: string,
  withCharm: boolean,
  signal?: AbortSignal,
): Promise<InventoryResponse> {
  const qParam = q && q !== '*' ? '&q=' + encodeURIComponent(q) : '';
  const extParam = exteriors.length ? '&exterior=' + exteriors.join(',') : '';
  const url =
    'https://skinsmonkey.com/api/inventory?limit=120&offset=' +
    offset +
    '&appId=730&sort=relevance' +
    qParam +
    extParam +
    (withCharm ? '&withCharm=true' : '');
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json, text/plain, */*',
      'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      priority: 'u=1, i',
      'x-csrf-token': csrf,
    },
    referrer: 'https://skinsmonkey.com/trade',
    credentials: 'include',
    mode: 'cors',
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) {
    throw new Error(
      'HTTP ' + res.status + (res.status === 402 ? ' — token invalid or session expired' : ''),
    );
  }
  return res.json();
}

/** Drives pagination until empty page or `maxPages` reached. */
export async function scanAll(opts: {
  q: string;
  exteriors: string[];
  withCharm: boolean;
  csrf: string;
  maxPages?: number;
  signal?: AbortSignal;
  onPage?: (loaded: number, total: number | null) => void;
}): Promise<RawAsset[]> {
  const { q, exteriors, withCharm, csrf } = opts;
  const max = opts.maxPages ?? 80;
  const all: RawAsset[] = [];
  let offset = 0;
  let errors = 0;
  for (let page = 0; page < max; page++) {
    let data: InventoryResponse;
    try {
      data = await fetchPage(q, exteriors, offset, csrf, withCharm, opts.signal);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      if (++errors >= 3) throw e;
      offset += 120;
      await sleep(600);
      continue;
    }
    errors = 0;
    const chunk = data.assets ?? [];
    all.push(...chunk);
    opts.onPage?.(all.length, data.total ?? null);
    if (chunk.length < 120) break;
    offset += 120;
    await sleep(280);
  }
  return all;
}

/* ── Filters ─────────────────────────────────────────────────────────── */
export interface FilterOpts {
  pattern?: string;
  floatMax?: string;
  withCharm?: boolean;
  charmName?: string;
  charmPattern?: string;
}

function parsePatterns(raw: string | undefined): Set<number> | null {
  const cleaned = (raw || '').replace(/[^0-9,;]/g, '');
  if (!cleaned) return null;
  const nums = cleaned
    .split(/[,;]+/)
    .map((s) => parseInt(s, 10))
    .filter((n) => !isNaN(n) && n >= 0);
  return nums.length ? new Set(nums) : null;
}

function parseCharmPatterns(
  raw: string | undefined,
): { nums: Set<number>; ranges: Array<{ min: number; max: number }> } | null {
  if (!raw || !raw.trim()) return null;
  const nums: number[] = [];
  const ranges: Array<{ min: number; max: number }> = [];
  raw.split(/[,;]+/).forEach((part) => {
    const s = part.trim();
    if (!s) return;
    const dash = s.indexOf('-', 1);
    if (dash > 0) {
      const a = parseInt(s.slice(0, dash).trim(), 10);
      const b = parseInt(s.slice(dash + 1).trim(), 10);
      if (!isNaN(a) && !isNaN(b) && a >= 0 && b >= 0) {
        ranges.push({ min: Math.min(a, b), max: Math.max(a, b) });
        return;
      }
    }
    const n = parseInt(s, 10);
    if (!isNaN(n) && n >= 0) nums.push(n);
  });
  if (!nums.length && !ranges.length) return null;
  return { nums: new Set(nums), ranges };
}

export function applyFilter(items: RawAsset[], f: FilterOpts): RawAsset[] {
  const patSet = parsePatterns(f.pattern);
  const charmPatFilter = parseCharmPatterns(f.charmPattern);
  const flMax = f.floatMax && f.floatMax.trim() !== '' ? parseFloat(f.floatMax) : null;
  const charmName = (f.charmName ?? '').toLowerCase();
  return items.filter((a) => {
    const g = a.game730 ?? {};
    if (patSet !== null) {
      const seed = Number(g.paintSeed);
      if (isNaN(seed) || !patSet.has(seed)) return false;
    }
    if (flMax !== null && (g.paintWear ?? 1) > flMax) return false;
    const keychains = g.keychains ?? [];
    if (f.withCharm) {
      if (!keychains.length) return false;
      if (
        charmName &&
        !keychains.some((k) => (k.marketName ?? '').toLowerCase().includes(charmName))
      )
        return false;
      if (
        charmPatFilter !== null &&
        !keychains.some((k) => charmPatMatches(Number(k.pattern), charmPatFilter))
      )
        return false;
    }
    return true;
  });
}

function charmPatMatches(
  seed: number,
  f: { nums: Set<number>; ranges: Array<{ min: number; max: number }> },
): boolean {
  if (isNaN(seed)) return false;
  if (f.nums.has(seed)) return true;
  return f.ranges.some((r) => seed >= r.min && seed <= r.max);
}

/* ── Steam Market accessory pricing (queued ~1.1s) ───────────────────── */
const _steamCache: Record<string, number | null> = {};
let _steamQueue: Promise<unknown> = Promise.resolve();

export function steamPrice(marketHashName: string): Promise<number | null> {
  if (Object.prototype.hasOwnProperty.call(_steamCache, marketHashName)) {
    return Promise.resolve(_steamCache[marketHashName]!);
  }
  _steamQueue = _steamQueue.then(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(
          async () => {
            try {
              const url =
                'https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=' +
                encodeURIComponent(marketHashName);
              const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
              if (!r.ok) throw new Error('HTTP ' + r.status);
              const d = (await r.json()) as { median_price?: string; lowest_price?: string };
              const raw = d.median_price || d.lowest_price || '0';
              const cents = Math.round(parseFloat(raw.replace(/[^0-9.]/g, '')) * 100);
              _steamCache[marketHashName] = isNaN(cents) ? null : cents;
            } catch {
              _steamCache[marketHashName] = null;
            }
            resolve();
          },
          1000 + Math.random() * 200,
        );
      }),
  );
  return _steamQueue.then(() => _steamCache[marketHashName] ?? null);
}

export async function fetchAccessoryPrices(
  items: RawAsset[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const names = new Set<string>();
  items.forEach((a) => {
    const g = a.game730 ?? {};
    (g.stickers ?? []).forEach((s) => {
      if (s.marketName) names.add(s.marketName);
    });
    (g.keychains ?? []).forEach((k) => {
      if (k.marketName) names.add(k.marketName);
    });
  });
  if (!names.size) return;
  const total = names.size;
  let done = 0;
  for (const name of names) {
    await steamPrice(name);
    done++;
    onProgress?.(done, total);
  }
}

export function getSteamPrice(name: string): number | null {
  return _steamCache[name] ?? null;
}

/* ── Build clipboard-replacement payload ─────────────────────────────── */
export function buildExportPayload(items: RawAsset[]): ExportPayload {
  return {
    exported_at: new Date().toISOString(),
    items: items.map<ArbitrageItem>((a) => {
      const it = a.item ?? {};
      const g = a.game730 ?? {};
      const name = it.marketName ?? '';
      const keychains = g.keychains ?? [];
      const aid = a.assetId ?? a.id ?? '';
      const first = keychains[0];
      return {
        assetId: aid,
        marketName: name,
        source: 'skinsmonkey',
        source_url: 'https://skinsmonkey.com/trade',
        source_item_url: 'https://skinsmonkey.com/trade' + (aid ? '?assetId=' + aid : ''),
        smPrice: it.price ?? 0,
        paintSeed: g.paintSeed ?? null,
        paintWear: g.paintWear ?? null,
        paintIndex: g.paintIndex ?? null,
        defIndex: getDefIndex(name),
        exterior: it.details?.exterior ?? '',
        statTrak: it.details?.statTrak ?? false,
        souvenir: it.details?.souvenir ?? false,
        tradeLock: a.tradeLock ?? false,
        tradeLockUntil: a.tradableAfter ?? null,
        imageUrl: a.imageUrl ?? it.imageUrl ?? '',
        inspectUrl: g.inspectUrl ?? '',
        stickers: (g.stickers ?? []).map((s) => ({
          name: s.marketName ?? '',
          steamPrice: getSteamPrice(s.marketName ?? ''),
        })),
        charm: first
          ? { name: first.marketName ?? '', steamPrice: getSteamPrice(first.marketName ?? '') }
          : null,
      };
    }),
  };
}
