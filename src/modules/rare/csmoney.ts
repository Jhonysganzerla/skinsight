/**
 * CS.Money rare-sticker collector + rare_stickers.json regenerator.
 * Ported from sticker-raro-pirateswap-skinsmonkey/csmoney.js.
 */
import { sleep } from '../shared/fmt';
import { t } from '../shared/i18n';
import { debugLog, isDebug } from '../shared/debug';
import type { CsMoneyItem } from './types';

const LIMIT = 60;
const ENDPOINT = 'https://cs.money/5.0/load_bots_inventory/730';
const BASE = { hasRareStickers: 'true', order: 'asc', sort: 'price' } as const;

interface RawCsmSticker {
  name?: string;
  price?: number;
  wear?: number;
  img?: string;
  /** CS.Money's per-sticker overpay contribution (USD). Captured for the
   *  overpay-formula calibration dump (debug only). Field name per the user's
   *  API inspection; verified at runtime by the debug raw-keys diagnostic. */
  overprice?: number;
}
interface RawCsmItem {
  id?: string | number;
  fullName?: string;
  name?: string;
  asset?: { names?: { full?: string; short?: string } };
  price?: number;
  pricing?: { computed?: number; default?: number };
  /** CS.Money's per-item overpay breakdown. `stickers` is the sticker-overpay
   *  total (USD). Captured for calibration (debug only). */
  overpay?: { stickers?: number } | null;
  /** Paint seed (v0.9 Rare Pattern). */
  pattern?: number;
  stickers?: (RawCsmSticker | null)[];
  /** Image fields, in fallback order. v0.4 HAR confirmed `img` is the
   *  primary; the others exist as defense against API changes. */
  img?: string;
  steamImg?: string;
  preview?: string;
  screenshot?: string;
}
interface CsmResp {
  items?: RawCsmItem[];
  total?: number;
  message?: string;
}

const toNumber = (v: unknown): number => Number(v ?? 0) || 0;
const qs = (obj: Record<string, string>): string => new URLSearchParams(obj).toString();
const getItemName = (item: RawCsmItem): string =>
  item?.fullName || item?.name || item?.asset?.names?.full || item?.asset?.names?.short || '';
const getWeaponPrice = (item: RawCsmItem): number =>
  toNumber(item?.price ?? item?.pricing?.computed ?? item?.pricing?.default ?? 0);

/**
 * Resolve the weapon thumbnail URL from a CS.Money inventory item.
 *
 * v0.4 HAR (10 items across 5 weapon types) confirmed `item.img` is always
 * present and points at the Steam economy CDN. The fallback chain — steamImg
 * (duplicate of img in current API), preview (csmoney screenshot CDN),
 * screenshot (csmoney HD screenshot) — exists so a future schema change
 * doesn't strand the UI with blank thumbnails.
 *
 * Returns null when every candidate is missing or empty; callers render the
 * inline SVG placeholder.
 */
export function extractCsMoneyImageUrl(item: RawCsmItem): string | null {
  const candidates = [item.img, item.steamImg, item.preview, item.screenshot];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return null;
}

export interface CsmCollectOpts {
  maxPages: number;
  delayMs?: number;
  onStatus?: (msg: string) => void;
  /** Structured per-page callback (1-based). The regenerate flow counts pages
   *  through this instead of regex-matching the (localized) status text. */
  onPage?: (page: number) => void;
  signal?: { aborted: boolean };
}

export async function collectCsMoney(opts: CsmCollectOpts): Promise<CsMoneyItem[]> {
  const out: CsMoneyItem[] = [];
  const delay = Math.max(100, Math.min(5000, opts.delayMs ?? 900));
  let fetched = 0;
  let totalExpected: number | null = null;
  try {
    for (let page = 0; page < opts.maxPages; page++) {
      if (opts.signal?.aborted) break;
      const offset = page * LIMIT;
      const url = `${ENDPOINT}?${qs({ ...BASE, limit: String(LIMIT), offset: String(offset) })}`;
      opts.onPage?.(page + 1);
      opts.onStatus?.(t('csm.page', { p: page + 1, n: out.length }));
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = (await res.json()) as CsmResp;
      if (typeof data.message === 'string' && data.message.toLowerCase().includes('limite')) {
        throw new Error(data.message);
      }
      const items = data.items ?? [];
      if (typeof data.total === 'number' && data.total > 0) totalExpected = data.total;
      if (!items.length) break;
      // Debug-only: on the first page, print the raw item/sticker key sets so we
      // can confirm the overpay/overprice field names against the live API
      // (don't assume — verify). Off unless localStorage['skinsight:debug'] set.
      if (isDebug() && page === 0 && items[0]) {
        debugLog('[Skinsight][debug] raw CS.Money item keys:', Object.keys(items[0]));
        const firstSticker = (items[0].stickers ?? []).filter(Boolean)[0] as
          | RawCsmSticker
          | undefined;
        if (firstSticker) {
          debugLog('[Skinsight][debug] raw sticker keys:', Object.keys(firstSticker));
        }
        debugLog('[Skinsight][debug] raw item sample:', items[0]);
      }
      fetched += items.length;
      for (const item of items) {
        const rawStickers = (item.stickers ?? []).filter(Boolean) as RawCsmSticker[];
        if (!rawStickers.length) continue;
        const weaponPriceUsd = getWeaponPrice(item);
        const itemName = getItemName(item);
        if (!itemName) continue;
        const stickers = rawStickers.map((s) => ({
          name: s.name || 'Sticker',
          priceUsd: toNumber(s.price),
          wear: toNumber(s.wear),
          imageUrl: typeof s.img === 'string' && s.img.length > 0 ? s.img : null,
          overprice: toNumber(s.overprice),
        }));
        const stickersTotalUsd = stickers.reduce((a, s) => a + s.priceUsd, 0);
        const netUsd = stickersTotalUsd - weaponPriceUsd;
        out.push({
          id: item.id ?? '',
          name: itemName,
          imageUrl: extractCsMoneyImageUrl(item),
          weaponPriceUsd,
          stickersTotalUsd,
          netUsd,
          overpayStickers: toNumber(item.overpay?.stickers),
          paintSeed: typeof item.pattern === 'number' ? item.pattern : null,
          stickers,
        });
      }
      if (items.length < LIMIT) break;
      if (totalExpected !== null && fetched >= totalExpected) break;
      await sleep(delay);
    }
  } catch (e) {
    opts.onStatus?.(t('scan.error', { msg: (e as Error).message }));
  }
  return out;
}

/* ── Rare stickers report regenerator ───────────────────────────────── */

/**
 * Fixed membership floor for the rare-sticker DB (decision #16 / prompt T2).
 *
 * The collector's `hasRareStickers=true` filter (decision #17) defines the
 * *universe* of items we scan; this floor defines which aggregated stickers
 * actually enter the DB. Without it, a cheap sticker that merely rode along on
 * a rare-flagged item (e.g. a $0.02 Champion sticker next to a Gold) would
 * pollute the finder. A sticker counts as rare iff its *minimum* observed
 * market price is at least this value.
 *
 * v0.4.1: raised $0.50 → $1.00. The $0.50 floor still let a lot of low-value
 * stickers into the DB and diluted the hit list; $1.00 keeps the universe to
 * stickers actually worth flagging. The remote (Python-generated) list is the
 * authority going forward — keep this constant in sync with the generator.
 */
export const RARE_THRESHOLD_USD = 1.0;

export interface RareReport {
  /** Membership floor applied to min_price. Constant — see RARE_THRESHOLD_USD. */
  inferred_threshold_usd: number;
  /** ISO timestamp of generation (so a committed JSON is traceable). */
  generated_at: string;
  items_with_stickers: number;
  total_sticker_observations: number;
  unique_stickers: number;
  rare_count: number;
  normal_count: number;
  note: string;
  rare_stickers: RareReportSticker[];
  normal_stickers: RareReportSticker[];
}

export interface RareReportSticker {
  name: string;
  count: number;
  min_price: number;
  max_price: number;
  avg_price: number;
  /** Sticker icon URL (first non-empty observed). Null when never present. */
  img: string | null;
  is_rare_candidate: boolean;
}

interface Agg {
  name: string;
  count: number;
  min_price: number;
  max_price: number;
  sum: number;
  img: string | null;
}

/**
 * Aggregate every sticker observation across the scanned CS.Money items into a
 * rare-sticker report. Stickers are keyed by name; a sticker is a rare
 * candidate iff its minimum observed price ≥ RARE_THRESHOLD_USD.
 */
export function buildRareReport(items: CsMoneyItem[]): RareReport {
  const threshold = RARE_THRESHOLD_USD;
  const obs: Array<{ name: string; price: number; img: string | null }> = [];
  let itemsWithStickers = 0;
  for (const x of items) {
    const stickers = x.stickers ?? [];
    if (!stickers.length) continue;
    itemsWithStickers += 1;
    for (const s of stickers) {
      obs.push({ name: s.name, price: toNumber(s.priceUsd), img: s.imageUrl ?? null });
    }
  }
  const agg = new Map<string, Agg>();
  for (const o of obs) {
    if (!o.name) continue;
    const a = agg.get(o.name) ?? {
      name: o.name,
      count: 0,
      min_price: o.price,
      max_price: o.price,
      sum: 0,
      img: null,
    };
    a.count += 1;
    a.min_price = Math.min(a.min_price, o.price);
    a.max_price = Math.max(a.max_price, o.price);
    a.sum += o.price;
    if (a.img === null && o.img) a.img = o.img;
    agg.set(o.name, a);
  }
  const finalize = (a: Agg): RareReportSticker => {
    const min_price = +a.min_price.toFixed(4);
    return {
      name: a.name,
      count: a.count,
      min_price,
      max_price: +a.max_price.toFixed(4),
      avg_price: +(a.sum / Math.max(a.count, 1)).toFixed(4),
      img: a.img,
      is_rare_candidate: min_price >= threshold,
    };
  };
  const all = [...agg.values()].map(finalize);
  const rare = all.filter((a) => a.is_rare_candidate).sort((a, b) => b.min_price - a.min_price);
  const normal = all.filter((a) => !a.is_rare_candidate).sort((a, b) => b.min_price - a.min_price);
  return {
    inferred_threshold_usd: threshold,
    generated_at: new Date().toISOString(),
    items_with_stickers: itemsWithStickers,
    total_sticker_observations: obs.length,
    unique_stickers: agg.size,
    rare_count: rare.length,
    normal_count: normal.length,
    note: `Rare candidate iff min observed price ≥ $${threshold.toFixed(2)}. Universe: CS.Money hasRareStickers=true items.`,
    rare_stickers: rare,
    normal_stickers: normal,
  };
}
