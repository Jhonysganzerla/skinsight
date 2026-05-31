/**
 * Steam Community Market price oracle (v0.5).
 *
 * On-demand, per-item — NEVER a bulk scan (Steam rate-limits ~20 req/min/IP and
 * bans on abuse; briefing §9 DON'T #4). The real fetch runs in the SERVICE
 * WORKER (CORS requires a background origin), gated by a 15 req/min token
 * bucket with exponential backoff on 429, and cached in chrome.storage.local
 * with a 1h TTL per market_hash_name.
 *
 * Two consumption paths:
 *   - async `getSteamPrice()` — SW-side: bucket → fetch → cache. The content
 *     script reaches it via the `steam:price` message.
 *   - sync `getSteamPriceCached()` — reads a per-context in-memory mirror.
 *     The Arbitrage flow (`buildExportPayload`) depends on a synchronous read,
 *     so callers pre-warm the mirror (await the message) BEFORE building.
 *
 * Prices are USD (priceoverview currency=1). Never mix with a BRL display.
 */
import { steamBucket } from '../shared/throttle';

export interface SteamPrice {
  /** Lowest listed price, in USD cents. null when Steam omitted it. */
  lowestCents: number | null;
  /** Median sale price, in USD cents. null when Steam omitted it. */
  medianCents: number | null;
  /** 24h sales volume. null when Steam omitted it. */
  volume: number | null;
  /** Always 'USD' — priceoverview is fetched with currency=1. */
  currency: 'USD';
  /** Epoch ms of the successful fetch (for TTL). */
  fetchedAt: number;
}

export const STEAM_TTL_MS = 60 * 60 * 1000; // 1h
export const STEAM_MAX_PER_MIN = 15;
export const STEAM_WINDOW_MS = 60_000;

const KEY = (mhn: string): string => `steam_price:${mhn}`;

/** Per-context mirror of the storage cache (sync reads for the Arbitrage path).
 *  Capped (v0.7 T1.b): insertion-ordered Map, evict-oldest above the cap so a
 *  very long session can't grow it without bound. */
const _mirror = new Map<string, SteamPrice>();
const STEAM_MIRROR_MAX = 1000;

function mirrorSet(marketHashName: string, p: SteamPrice): void {
  _mirror.delete(marketHashName); // re-insert so it counts as most-recent
  _mirror.set(marketHashName, p);
  if (_mirror.size > STEAM_MIRROR_MAX) {
    const oldest = _mirror.keys().next().value;
    if (oldest !== undefined) _mirror.delete(oldest);
  }
}

/** Bucket lives at module scope so the whole SW shares one 15/min budget. */
const _bucket = steamBucket();
/** Consecutive-429 counter driving exponential backoff. */
let _consecutive429 = 0;

function fresh(p: SteamPrice | undefined | null, now = Date.now()): SteamPrice | null {
  return p && now - p.fetchedAt < STEAM_TTL_MS ? p : null;
}

/** Synchronous mirror read — the Arbitrage contract. null when absent/stale. */
export function getSteamPriceCached(marketHashName: string): SteamPrice | null {
  return fresh(_mirror.get(marketHashName));
}

/** Seed the mirror from a message response (content-script side). */
export function primeSteamMirror(marketHashName: string, p: SteamPrice | null): void {
  if (p) mirrorSet(marketHashName, p);
}

/** "$12.34" → 1234 cents. Strips currency symbols/grouping. null if unparseable. */
export function parsePriceCents(raw: string | undefined): number | null {
  if (typeof raw !== 'string') return null;
  const n = parseFloat(raw.replace(/[^0-9.,]/g, '').replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** "1,234" → 1234. null if unparseable. */
export function parseVolume(raw: string | undefined): number | null {
  if (typeof raw !== 'string') return null;
  const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

async function readCache(marketHashName: string): Promise<SteamPrice | null> {
  try {
    const r = (await chrome.storage.local.get(KEY(marketHashName))) as Record<string, unknown>;
    const p = r[KEY(marketHashName)] as SteamPrice | undefined;
    const hit = fresh(p);
    if (hit) mirrorSet(marketHashName, hit);
    return hit;
  } catch {
    return null;
  }
}

async function writeCache(marketHashName: string, p: SteamPrice): Promise<void> {
  mirrorSet(marketHashName, p);
  try {
    await chrome.storage.local.set({ [KEY(marketHashName)]: p });
  } catch {
    /* storage full / unavailable — mirror still serves this session */
  }
}

/**
 * Fetch (or cache-serve) the Steam price for one item. SW-side. Never throws —
 * returns null on any error so the UI can show an error state without a crash.
 */
export async function getSteamPrice(marketHashName: string): Promise<SteamPrice | null> {
  if (!marketHashName) return null;
  const cached = await readCache(marketHashName);
  if (cached) return cached;

  await _bucket.acquire();
  try {
    const url =
      'https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=' +
      encodeURIComponent(marketHashName);
    const res = await fetch(url);
    if (res.status === 429) {
      // Exponential backoff: 30s, 60s, 120s … capped at 5min.
      _consecutive429 += 1;
      const pause = Math.min(30_000 * 2 ** (_consecutive429 - 1), 300_000);
      _bucket.pause(pause);
      return null;
    }
    if (!res.ok) return null;
    _consecutive429 = 0;
    const d = (await res.json()) as {
      success?: boolean;
      lowest_price?: string;
      median_price?: string;
      volume?: string;
    };
    if (d.success === false) return null;
    const price: SteamPrice = {
      lowestCents: parsePriceCents(d.lowest_price),
      medianCents: parsePriceCents(d.median_price),
      volume: parseVolume(d.volume),
      currency: 'USD',
      fetchedAt: Date.now(),
    };
    await writeCache(marketHashName, price);
    return price;
  } catch {
    return null;
  }
}

/** Quota snapshot for the overlay indicator ("Steam slow — N/15 used"). */
export function steamQuota(): { used: number; max: number; windowMs: number } {
  const { tokens } = _bucket.inspect();
  const used = Math.max(0, Math.min(STEAM_MAX_PER_MIN, Math.round(STEAM_MAX_PER_MIN - tokens)));
  return { used, max: STEAM_MAX_PER_MIN, windowMs: STEAM_WINDOW_MS };
}
