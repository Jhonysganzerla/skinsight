/**
 * Loads the slim rare_stickers.json bundled in public/. Format:
 *   [['Sticker | Foo (Holo) | Katowice 2014', 210.5], ...]
 */
let _map: Map<string, number> | null = null;
let _loadPromise: Promise<Map<string, number>> | null = null;

const norm = (s: string): string =>
  String(s || '')
    .replace(/^\s*Sticker\s*\|\s*/i, '')
    .trim()
    .toLowerCase();

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
