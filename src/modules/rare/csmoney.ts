/**
 * CS.Money rare-sticker collector + rare_stickers.json regenerator.
 * Ported from sticker-raro-pirateswap-skinsmonkey/csmoney.js.
 */
import { sleep } from '../shared/fmt';
import type { CsMoneyItem } from './types';

const LIMIT = 60;
const ENDPOINT = 'https://cs.money/5.0/load_bots_inventory/730';
const BASE = { hasRareStickers: 'true', order: 'asc', sort: 'price' } as const;

interface RawCsmSticker {
  name?: string;
  price?: number;
  wear?: number;
}
interface RawCsmItem {
  id?: string | number;
  fullName?: string;
  name?: string;
  asset?: { names?: { full?: string; short?: string } };
  price?: number;
  pricing?: { computed?: number; default?: number };
  stickers?: (RawCsmSticker | null)[];
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

export interface CsmCollectOpts {
  maxPages: number;
  delayMs?: number;
  onStatus?: (msg: string) => void;
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
      opts.onStatus?.(`Collecting page ${page + 1}/${opts.maxPages}…`);
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = (await res.json()) as CsmResp;
      if (typeof data.message === 'string' && data.message.toLowerCase().includes('limite')) {
        throw new Error(data.message);
      }
      const items = data.items ?? [];
      if (typeof data.total === 'number' && data.total > 0) totalExpected = data.total;
      if (!items.length) break;
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
        }));
        const stickersTotalUsd = stickers.reduce((a, s) => a + s.priceUsd, 0);
        const netUsd = stickersTotalUsd - weaponPriceUsd;
        out.push({
          id: item.id ?? '',
          name: itemName,
          weaponPriceUsd,
          stickersTotalUsd,
          netUsd,
          stickers,
        });
      }
      if (items.length < LIMIT) break;
      if (totalExpected !== null && fetched >= totalExpected) break;
      await sleep(delay);
    }
  } catch (e) {
    opts.onStatus?.('Error: ' + (e as Error).message);
  }
  return out;
}

/* ── Rare stickers report regenerator ───────────────────────────────── */
export interface RareReport {
  inferred_threshold_usd: number;
  items_with_stickers: number;
  total_sticker_observations: number;
  unique_stickers: number;
  rare_count: number;
  normal_count: number;
  note: string;
  rare_stickers: RareReportSticker[];
  normal_stickers: RareReportSticker[];
}

interface RareReportSticker {
  name: string;
  count: number;
  min_price: number;
  max_price: number;
  avg_price: number;
  is_rare_candidate: boolean;
}

interface Agg {
  name: string;
  count: number;
  min_price: number;
  max_price: number;
  sum: number;
  is_rare_candidate: boolean;
}

export function buildRareReport(items: CsMoneyItem[]): RareReport {
  const perItemMax: number[] = [];
  const obs: Array<{ name: string; price: number }> = [];
  for (const x of items) {
    const stickers = x.stickers ?? [];
    if (!stickers.length) continue;
    const prices = stickers.map((s) => toNumber(s.priceUsd));
    const maxP = Math.max(...prices, 0);
    if (maxP <= 0) continue;
    perItemMax.push(maxP);
    for (const s of stickers) obs.push({ name: s.name, price: toNumber(s.priceUsd) });
  }
  const threshold = perItemMax.length ? Math.min(...perItemMax) : 0;
  const agg = new Map<string, Agg>();
  for (const o of obs) {
    if (!o.name) continue;
    const a = agg.get(o.name) ?? {
      name: o.name,
      count: 0,
      min_price: o.price,
      max_price: o.price,
      sum: 0,
      is_rare_candidate: false,
    };
    a.count += 1;
    a.min_price = Math.min(a.min_price, o.price);
    a.max_price = Math.max(a.max_price, o.price);
    a.sum += o.price;
    if (o.price >= threshold) a.is_rare_candidate = true;
    agg.set(o.name, a);
  }
  const finalize = (a: Agg): RareReportSticker => ({
    name: a.name,
    count: a.count,
    min_price: +a.min_price.toFixed(4),
    max_price: +a.max_price.toFixed(4),
    avg_price: +(a.sum / Math.max(a.count, 1)).toFixed(4),
    is_rare_candidate: a.is_rare_candidate,
  });
  const all = [...agg.values()].map(finalize);
  const rare = all.filter((a) => a.is_rare_candidate).sort((a, b) => b.max_price - a.max_price);
  const normal = all.filter((a) => !a.is_rare_candidate).sort((a, b) => b.max_price - a.max_price);
  return {
    inferred_threshold_usd: +threshold.toFixed(4),
    items_with_stickers: perItemMax.length,
    total_sticker_observations: obs.length,
    unique_stickers: agg.size,
    rare_count: rare.length,
    normal_count: normal.length,
    note: 'inferred_threshold_usd = min(max sticker price per item). Stickers ≥ threshold = rare candidates.',
    rare_stickers: rare,
    normal_stickers: normal,
  };
}
