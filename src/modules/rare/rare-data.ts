/**
 * Loads the slim rare_stickers.json bundled in public/. Format:
 *   [['Sticker | Foo (Holo) | Katowice 2014', 210.5], ...]
 */
let _map: Map<string, number> | null = null;
let _loadPromise: Promise<Map<string, number>> | null = null;

/**
 * Normalize a sticker name for map lookup: strip the "Sticker | " prefix,
 * trim, lowercase.
 *
 * v0.4.1: memoized. A PS scan with 2000 items calls into lookup ~6000 times
 * across the inner findRareResults loop, each call doing 2 regex + lowercase.
 * With memoization, the unique-name count caps at the rare DB size
 * (~1300) — every subsequent call is a single Map.get().
 */
const _normCache = new Map<string, string>();
export function norm(s: unknown): string {
  const k = String(s ?? '');
  const cached = _normCache.get(k);
  if (cached !== undefined) return cached;
  const v = k
    .replace(/^\s*Sticker\s*\|\s*/i, '')
    .trim()
    .toLowerCase();
  _normCache.set(k, v);
  return v;
}

/** Test seam — reset the memoization cache between runs. */
export function __resetNormCache(): void {
  _normCache.clear();
}

async function loadOnce(): Promise<Map<string, number>> {
  const url = chrome.runtime.getURL('rare_stickers.json');
  const res = await fetch(url);
  if (!res.ok) throw new Error('rare_stickers.json HTTP ' + res.status);
  const arr = (await res.json()) as Array<[string, number]>;
  const m = new Map<string, number>();
  for (const [name, price] of arr) m.set(norm(name), price);
  _map = m;
  return m;
}

export async function getRareMap(): Promise<Map<string, number>> {
  if (_map) return _map;
  if (!_loadPromise) _loadPromise = loadOnce();
  return _loadPromise;
}

export function lookup(map: Map<string, number>, stickerName: string): number | undefined {
  return map.get(norm(stickerName));
}
