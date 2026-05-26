/** Convenience accessors over the typed settings store. */
import {
  getSettings,
  onSettingsChanged,
  type Settings,
  type SkinsmonkeyMode,
} from './storage';

let _cache: Settings | null = null;

export async function loadSettings(): Promise<Settings> {
  if (_cache) return _cache;
  _cache = await getSettings();
  return _cache;
}

/**
 * The mode SkinsMonkey should operate in. Other sites ignore this and
 * always behave per their fixed role:
 *   - PirateSwap / CS.Money: always-on Rare
 *   - CSFloat:               always-on Arbitrage oracle
 */
export async function getSkinsmonkeyMode(): Promise<SkinsmonkeyMode> {
  const s = await loadSettings();
  return s.skinsmonkeyMode;
}

/** Subscribe to live settings changes; updates the cache and fires `cb`. */
export function watchSettings(cb: (s: Settings) => void): () => void {
  return onSettingsChanged((next) => {
    _cache = next;
    cb(next);
  });
}
