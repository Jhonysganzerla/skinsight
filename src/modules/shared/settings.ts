/** Convenience accessors over the typed settings store. */
import { getSettings, onSettingsChanged, type Settings, type SkinsmonkeyMode } from './storage';
import { setLocaleOverride } from './i18n';
import { setProfitParams } from './profit';

let _cache: Settings | null = null;

export async function loadSettings(): Promise<Settings> {
  if (_cache) return _cache;
  _cache = await getSettings();
  return _cache;
}

/**
 * Read the persisted language preference and push it into the i18n module so
 * `t()` resolves in the chosen locale. 'auto' → null (defer to navigator).
 * Call this once at the start of every context (popup, content scripts, options
 * page) BEFORE the first render — `t()` is synchronous and reads the override.
 */
export async function applyStoredLocale(): Promise<void> {
  const s = await loadSettings();
  setLocaleOverride(s.locale === 'auto' ? null : s.locale);
}

/**
 * Push the stored net-profit economics into the profit module so the card
 * renderers can read them synchronously. Call once at the start of the
 * card-rendering contexts (SM / PS / CS.Money) before the first render.
 */
export async function applyStoredProfitParams(): Promise<void> {
  const s = await loadSettings();
  setProfitParams(s.profit);
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
    // Keep this context's locale + profit params in sync if the user changed
    // them elsewhere (e.g. the options page) so the next render uses them.
    setLocaleOverride(next.locale === 'auto' ? null : next.locale);
    setProfitParams(next.profit);
    cb(next);
  });
}
