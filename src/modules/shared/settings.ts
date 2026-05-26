/** Convenience accessors over the typed settings store. */
import { getSettings, onSettingsChanged, type Settings } from './storage';

export type ModeKey = keyof Settings['modes'];

let _cache: Settings | null = null;

export async function loadSettings(): Promise<Settings> {
  if (_cache) return _cache;
  _cache = await getSettings();
  return _cache;
}

export async function isModeEnabled(mode: ModeKey): Promise<boolean> {
  const s = await loadSettings();
  return !!s.modes[mode];
}

/** Subscribe to live settings changes; updates the cache and fires `cb`. */
export function watchSettings(cb: (s: Settings) => void): () => void {
  return onSettingsChanged((next) => {
    _cache = next;
    cb(next);
  });
}
