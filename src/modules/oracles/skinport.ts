/**
 * Skinport price oracle (v0.6).
 *
 * Bulk market reference: ONE fetch of api.skinport.com/v1/items, indexed by
 * market_hash_name, served as a cross-market "Skinport (USD)" column on cards.
 *
 * Hard constraints (briefing §9 DON'T #5):
 *   - 5-min cache in chrome.storage.local. The TTL is CHECKED BEFORE any fetch;
 *     we NEVER call api.skinport.com more than once per window. The TTL *is* the
 *     rate-limit (no token bucket needed).
 *   - Lazy: a refresh only fires when the cache is expired AND the user runs a
 *     scan (the content script sends `skinport:refresh` at scan start).
 *   - Fetch runs in the SERVICE WORKER (CORS). Prices are USD (currency=USD).
 *
 * Same split as the rare/Steam oracles: the SW fetches + writes the cache; the
 * content script reads it (chrome.storage is reachable from both). All prices
 * are stored as USD cents. `min_price: null` (no listings) stays null — callers
 * render "no data", never $0.00.
 *
 * Note on Accept-Encoding: br — `Accept-Encoding` is a forbidden header in
 * fetch(); the browser sets it automatically and already negotiates brotli, so
 * the requirement is satisfied implicitly (setting it by hand is a no-op).
 */

export const SKINPORT_URL = 'https://api.skinport.com/v1/items?app_id=730&currency=USD';
export const SKINPORT_TTL_MS = 5 * 60 * 1000; // hard 5-min window
const KEY_SKINPORT = 'skinport_index';

/** Compact stored row: [minCents, meanCents, maxCents]; any may be null. */
export type SkinportRow = [number | null, number | null, number | null];

export interface SkinportPrice {
  minCents: number | null;
  meanCents: number | null;
  maxCents: number | null;
}

interface SkinportCache {
  fetchedAt: number;
  /** market_hash_name → [min, mean, max] in USD cents. */
  index: Record<string, SkinportRow>;
}

/** Per-context in-memory mirror (sync reads in the content script). */
let _mirror: Map<string, SkinportRow> | null = null;

/** USD float (e.g. 12.34) → cents (1234). null/invalid → null (never 0). */
export function toCents(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.round(v * 100);
}

interface RawSkinportItem {
  market_hash_name?: string;
  min_price?: number | null;
  mean_price?: number | null;
  max_price?: number | null;
}

/** Build the compact index from the raw /v1/items array. */
export function buildSkinportIndex(raw: unknown): Record<string, SkinportRow> {
  const index: Record<string, SkinportRow> = {};
  if (!Array.isArray(raw)) return index;
  for (const it of raw as RawSkinportItem[]) {
    const name = it?.market_hash_name;
    if (typeof name !== 'string' || !name) continue;
    index[name] = [toCents(it.min_price), toCents(it.mean_price), toCents(it.max_price)];
  }
  return index;
}

async function readCache(): Promise<SkinportCache | null> {
  try {
    const r = (await chrome.storage.local.get(KEY_SKINPORT)) as Record<string, unknown>;
    const c = r[KEY_SKINPORT] as Partial<SkinportCache> | undefined;
    if (!c || typeof c.fetchedAt !== 'number' || typeof c.index !== 'object' || !c.index) {
      return null;
    }
    return { fetchedAt: c.fetchedAt, index: c.index as Record<string, SkinportRow> };
  } catch {
    return null;
  }
}

export interface SkinportRefreshResult {
  ok: boolean;
  count?: number;
  fetchedAt?: number;
  /** True when the network call was skipped because the cache was still fresh. */
  cached?: boolean;
  error?: string;
}

/**
 * Refresh the Skinport index. SW-side. The TTL is checked FIRST — if the cache
 * is younger than SKINPORT_TTL_MS and `force` is false, returns immediately
 * WITHOUT touching the network (the §9 DON'T #5 guarantee). Never throws.
 */
export async function refreshSkinportIndex(force = false): Promise<SkinportRefreshResult> {
  const existing = await readCache();
  if (!force && existing && Date.now() - existing.fetchedAt < SKINPORT_TTL_MS) {
    return {
      ok: true,
      count: Object.keys(existing.index).length,
      fetchedAt: existing.fetchedAt,
      cached: true,
    };
  }
  try {
    // Accept-Encoding is browser-controlled (br negotiated automatically).
    const res = await fetch(SKINPORT_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json: unknown = await res.json();
    const index = buildSkinportIndex(json);
    const count = Object.keys(index).length;
    if (!count) return { ok: false, error: 'empty index' };
    const cache: SkinportCache = { fetchedAt: Date.now(), index };
    await chrome.storage.local.set({ [KEY_SKINPORT]: cache });
    return { ok: true, count, fetchedAt: cache.fetchedAt };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

/**
 * Content-side: hydrate the in-memory mirror from the stored index. Call once
 * after a `skinport:refresh` round-trip, before rendering cards.
 */
export async function loadSkinportIndex(): Promise<void> {
  const c = await readCache();
  _mirror = new Map(c ? Object.entries(c.index) : []);
}

/** Sync lookup for the card column. null when absent or no min price. */
export function getSkinportPrice(marketHashName: string): SkinportPrice | null {
  const row = _mirror?.get(marketHashName);
  if (!row) return null;
  return { minCents: row[0], meanCents: row[1], maxCents: row[2] };
}
