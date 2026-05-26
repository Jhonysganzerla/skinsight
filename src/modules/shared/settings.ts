/** Convenience accessors over the typed settings store. */
import { getSettings, onSettingsChanged, type ActiveMode, type Settings } from './storage';

let _cache: Settings | null = null;

export async function loadSettings(): Promise<Settings> {
  if (_cache) return _cache;
  _cache = await getSettings();
  return _cache;
}

/** Returns the currently active mode, or null if the user disabled both. */
export async function getActiveMode(): Promise<ActiveMode> {
  const s = await loadSettings();
  return s.activeMode;
}

/** True when `mode` is the currently active mode. */
export async function isModeActive(mode: 'arbitrage' | 'rare'): Promise<boolean> {
  return (await getActiveMode()) === mode;
}

/** Subscribe to live settings changes; updates the cache and fires `cb`. */
export function watchSettings(cb: (s: Settings) => void): () => void {
  return onSettingsChanged((next) => {
    _cache = next;
    cb(next);
  });
}
