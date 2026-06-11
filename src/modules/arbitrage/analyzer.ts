/**
 * CSFloat-side analyzer. Ported from busca_pattern_cs2/src/builder-csf.js.
 * Public ops:
 *   - fetchCsfPrice(item) → { price, estimated }
 *   - runAnalysis(items, callbacks) → AnalysisRow[]
 * Throttle gate fails CLOSED on SW messaging errors — see defaultRequestSlot.
 */
import { sleep } from '../shared/fmt';
import { send } from '../shared/messaging';
import { scoreItem } from './score';
import type { ArbitrageItem, AnalysisRow } from './types';

/**
 * Ask the service-worker token bucket for permission before each CSFloat
 * fetch. Returns immediately when a token is available; awaits otherwise.
 * Tests pass `gateOverride: () => Promise.resolve()` to bypass the SW.
 *
 * Fail-CLOSED on messaging errors (v0.9.x fix): if the SW is paused on a 429
 * and hits the MV3 idle kill with our response pending, `sendMessage` rejects
 * and `send()` returns `{ok:false}`. The old code ignored that and proceeded
 * un-throttled — exactly while CSFloat was 429ing. Now we sleep a local
 * fallback interval (~the steady-state bucket cadence at 45/min) instead.
 */
const GATE_FALLBACK_MS = 1500;

async function defaultRequestSlot(): Promise<void> {
  const r = await send({ type: 'csf:request-slot' });
  if (!r.ok) await sleep(GATE_FALLBACK_MS);
}
async function defaultReport429(): Promise<void> {
  await send({ type: 'csf:got-429' });
}

let _requestSlot: () => Promise<void> = defaultRequestSlot;
let _report429: () => Promise<void> = defaultReport429;

/** Test seam — let unit tests stub the gate without faking chrome.runtime. */
export function __setCsfGate(slot: () => Promise<void>, report429: () => Promise<void>): void {
  _requestSlot = slot;
  _report429 = report429;
}

/** Reset the gate to its default chrome.runtime-backed implementation. */
export function __resetCsfGate(): void {
  _requestSlot = defaultRequestSlot;
  _report429 = defaultReport429;
}

interface CsfListing {
  price?: number;
  reference?: { predicted_price?: number };
}

function csfCategoryParam(item: ArbitrageItem): string {
  if (item.statTrak) return '&category=2';
  if (item.souvenir) return '&category=3';
  return '';
}

function csfListingsTail(limit: number): string {
  return 'type=buy_now&limit=' + limit + '&sort_by=lowest_price&min_price=0&max_price=10000000';
}

function parseListingsBody(d: unknown): CsfListing[] {
  if (d == null) return [];
  if (Array.isArray(d)) return d as CsfListing[];
  const data = (d as { data?: unknown }).data;
  if (Array.isArray(data)) return data as CsfListing[];
  return [];
}

export async function fetchCsfPrice(
  item: ArbitrageItem,
  retries = 0,
): Promise<{ price: number | null; estimated: boolean }> {
  const seed = item.paintSeed;
  const cat = csfCategoryParam(item);
  const tail5 = csfListingsTail(5) + cat;
  const tail1 = csfListingsTail(1) + cat;
  let url: string;
  if (item.defIndex && item.paintIndex && seed != null) {
    url =
      '/api/v1/listings?def_index=' +
      item.defIndex +
      '&paint_index=' +
      item.paintIndex +
      '&paint_seed=' +
      seed +
      '&' +
      tail5;
  } else if (item.marketName && seed != null) {
    url =
      '/api/v1/listings?market_hash_name=' +
      encodeURIComponent(item.marketName) +
      '&paint_seed=' +
      seed +
      '&' +
      tail5;
  } else {
    return { price: null, estimated: false };
  }

  try {
    await _requestSlot();
    const r = await fetch(url, { credentials: 'include' });
    if (r.status === 429) {
      await _report429();
      if (retries >= 3) return { price: null, estimated: false };
      // SW pause covers the gap; small extra backoff prevents reentry storms
      // when several content scripts hit 429 in the same window.
      await sleep(500 * (1 + retries));
      return fetchCsfPrice(item, retries + 1);
    }
    const d = r.ok ? await r.json() : null;
    const listings = parseListingsBody(d);
    const first = listings[0];
    if (first && typeof first.price === 'number') {
      return { price: first.price, estimated: false };
    }
    // Fallback — predicted_price (no seed match).
    const refUrl =
      '/api/v1/listings?' +
      (item.defIndex && item.paintIndex
        ? 'def_index=' + item.defIndex + '&paint_index=' + item.paintIndex
        : 'market_hash_name=' + encodeURIComponent(item.marketName ?? '')) +
      '&' +
      tail1;
    await _requestSlot();
    const rr = await fetch(refUrl, { credentials: 'include' });
    if (!rr.ok) return { price: null, estimated: false };
    const dd = await rr.json();
    const predicted = parseListingsBody(dd)[0]?.reference?.predicted_price ?? null;
    return { price: predicted ?? null, estimated: true };
  } catch {
    return { price: null, estimated: false };
  }
}

export interface AnalysisCallbacks {
  onProgress?: (done: number, total: number) => void;
  isAborted?: () => boolean;
  /**
   * Extra delay between successive items, in ms. v0.4 moved throttling to a
   * shared token bucket in the service worker (45 req/min, burst 10) — see
   * `modules/shared/throttle.ts`. The bucket already enforces the cadence,
   * so the default here is `0`. Tests can pass a positive value if they want
   * to keep their fake-clock advances simple.
   */
  itemDelayMs?: number;
}

export async function runAnalysis(
  items: ArbitrageItem[],
  cb: AnalysisCallbacks = {},
): Promise<AnalysisRow[]> {
  const delay = cb.itemDelayMs ?? 0;
  const out: AnalysisRow[] = [];
  for (let i = 0; i < items.length; i++) {
    if (cb.isAborted?.()) return out;
    const item = items[i]!;
    const { price, estimated } = await fetchCsfPrice(item);
    if (cb.isAborted?.()) return out;
    if (price !== null) {
      out.push({ item, result: scoreItem(item, price, estimated) });
    }
    cb.onProgress?.(i + 1, items.length);
    // Throttle: skip the wait on the last item to avoid a wasted tick at end.
    if (delay > 0 && i < items.length - 1) {
      await sleep(delay);
    }
  }
  out.sort((a, b) => b.result.score - a.result.score);
  return out;
}
