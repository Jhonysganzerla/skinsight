/**
 * CSFloat-side analyzer. Ported from busca_pattern_cs2/src/builder-csf.js.
 * Public ops:
 *   - fetchCsfPrice(item) → { price, estimated }
 *   - runAnalysis(items, callbacks) → AnalysisRow[]
 */
import { sleep } from '../shared/fmt';
import { scoreItem } from './score';
import type { ArbitrageItem, AnalysisRow } from './types';

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
    const r = await fetch(url, { credentials: 'include' });
    if (r.status === 429) {
      if (retries >= 3) return { price: null, estimated: false };
      await sleep(2500 * (1 + retries));
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
}

export async function runAnalysis(
  items: ArbitrageItem[],
  cb: AnalysisCallbacks = {},
): Promise<AnalysisRow[]> {
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
  }
  out.sort((a, b) => b.result.score - a.result.score);
  return out;
}
