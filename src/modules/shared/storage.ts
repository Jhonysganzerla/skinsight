/** Typed wrappers over chrome.storage.local. */

import type { ExportPayload } from '../arbitrage/types';
import type { Locale } from './i18n';

/** The two modes the extension exposes. */
export type SkinsmonkeyMode = 'arbitrage' | 'rare';

/** UI language preference. 'auto' → detect from navigator.language. */
export type LocalePref = Locale | 'auto';

/**
 * Which detector the Rare scanners run (v0.9). Applies to every Rare scanner
 * (SkinsMonkey-rare, PirateSwap, CS.Money) via one popup sub-toggle:
 *   - 'sticker': rare-sticker finder (default).
 *   - 'pattern': rare paint-seed finder (Rare Pattern).
 */
export type RareSubmode = 'sticker' | 'pattern';

/**
 * Economic parameters for the SM→CS.Money net-profit estimate (v0.8 T1).
 * Configurable in the options page — NEVER hardcoded. Fractions are 0..1
 * (0.05 = 5%); the threshold is in USD. All money is USD internally.
 */
export interface ProfitParams {
  /** CS.Money Market sell fee for items below `sellFeeThreshold`. Default 0.05. */
  sellFeeUnder: number;
  /** CS.Money Market sell fee for items at/above `sellFeeThreshold`. Default 0.03. */
  sellFeeOver: number;
  /** USD boundary between the two sell-fee tiers. Default 1000. */
  sellFeeThreshold: number;
  /** Withdrawal/payout fee. CS.Money doesn't charge; varies by method. Default 0. */
  withdrawFee: number;
  /** Haircut applied to the sale value for a trade-locked item. Default 0. */
  tradeLockDiscount: number;
}

export const DEFAULT_PROFIT_PARAMS: ProfitParams = {
  sellFeeUnder: 0.05,
  sellFeeOver: 0.03,
  sellFeeThreshold: 1000,
  withdrawFee: 0,
  tradeLockDiscount: 0,
};

export interface Settings {
  /**
   * SkinsMonkey is the only site that supports both modes; the popup lets
   * the user pick. PirateSwap and CS.Money are always Rare; CSFloat is
   * always the Arbitrage oracle. Those content scripts ignore this setting.
   *
   * Default 'rare' — v0.4 repositioning: Skinsight is primarily a rare
   * sticker scanner, arbitrage is a secondary feature.
   */
  skinsmonkeyMode: SkinsmonkeyMode;
  /**
   * UI language for the overlay/popup/options (v0.7 T4). 'auto' defers to
   * navigator.language; 'en' / 'pt-BR' force a locale. Applied at startup in
   * each context via settings.applyStoredLocale().
   */
  locale: LocalePref;
  /** Rare detector sub-mode (v0.9): sticker (default) or pattern. */
  rareSubmode: RareSubmode;
  /** SM→CS.Money net-profit economics (v0.8 T1). Configurable in options. */
  profit: ProfitParams;
  /** Overlay state per hostname — minimized + remembered position. */
  overlay: Record<string, { minimized?: boolean; left?: number; top?: number } | undefined>;
}

export const DEFAULT_SETTINGS: Settings = {
  skinsmonkeyMode: 'rare',
  locale: 'auto',
  rareSubmode: 'sticker',
  profit: DEFAULT_PROFIT_PARAMS,
  overlay: {},
};

export interface TodayHit {
  ts: number;
  site: string;
  name: string;
  /** Sub-label, e.g. "SM $42.10 → CSF $58.00" or "3 rare stickers". */
  sub: string;
  /** Profit in USD (already converted from cents if applicable). */
  profitUsd: number;
}

interface StoreShape {
  settings: Settings;
  hits: TodayHit[];
  pending_arbitrage: { payload: ExportPayload; storedAt: number } | null;
}

const KEY_SETTINGS = 'settings';
const KEY_HITS = 'hits';
const KEY_PENDING = 'pending_arbitrage';
const KEY_OVERLAY = 'overlay_state';

/* ── Overlay position/minimized state (v0.9.x) ─────────────────────────
 * Lives in its OWN key, outside the `settings` blob. The old path went
 * through patchSettings (get → merge → set): a drag-end write racing a
 * popup toggle could silently drop one of the two. With a dedicated key the
 * two writers never touch the same record. Reads fall back to the legacy
 * `settings.overlay` map so existing users keep their saved positions. */

export interface OverlayPos {
  minimized?: boolean;
  left?: number;
  top?: number;
}

type OverlayStateMap = Record<string, OverlayPos | undefined>;

export async function getOverlayPos(key: string): Promise<OverlayPos | null> {
  try {
    const r = (await chrome.storage.local.get(KEY_OVERLAY)) as {
      [KEY_OVERLAY]?: OverlayStateMap;
    };
    const hit = r[KEY_OVERLAY]?.[key];
    if (hit) return hit;
    // Legacy fallback — positions saved before the dedicated key existed.
    const s = await getSettings();
    return s.overlay[key] ?? null;
  } catch {
    return null;
  }
}

export async function patchOverlayPos(key: string, patch: OverlayPos): Promise<void> {
  const r = (await chrome.storage.local.get(KEY_OVERLAY)) as {
    [KEY_OVERLAY]?: OverlayStateMap;
  };
  const map: OverlayStateMap = r[KEY_OVERLAY] ?? {};
  map[key] = { ...map[key], ...patch };
  await chrome.storage.local.set({ [KEY_OVERLAY]: map });
}

/**
 * Read settings, applying defaults + migrations:
 *   - v0.4 (now): `skinsmonkeyMode: 'arbitrage' | 'rare'`, default 'rare'.
 *   - v0.3:       `activeMode: 'arbitrage' | 'rare' | null`. Migrated below.
 *   - v0.2:       `modes: { arbitrage_sm, arbitrage_csf, rare_*, ... }`.
 *
 * Migration cascade picks the most-recent shape it can read; if `activeMode`
 * was `null` (user had both disabled in v0.3) we fall to the default 'rare'.
 */
function normalizeSettings(raw: unknown): Settings {
  const obj = (raw ?? {}) as Partial<Settings> & {
    activeMode?: 'arbitrage' | 'rare' | null;
    modes?: {
      arbitrage_sm?: boolean;
      arbitrage_csf?: boolean;
      rare_smps?: boolean;
      rare_csm?: boolean;
    };
  };
  let mode: SkinsmonkeyMode = DEFAULT_SETTINGS.skinsmonkeyMode;
  if (obj.skinsmonkeyMode === 'arbitrage' || obj.skinsmonkeyMode === 'rare') {
    mode = obj.skinsmonkeyMode;
  } else if (obj.activeMode === 'arbitrage' || obj.activeMode === 'rare') {
    mode = obj.activeMode;
  } else if (obj.modes) {
    const m = obj.modes;
    if (m.arbitrage_sm || m.arbitrage_csf) mode = 'arbitrage';
    else if (m.rare_smps || m.rare_csm) mode = 'rare';
  }
  const locale: LocalePref =
    obj.locale === 'en' || obj.locale === 'pt-BR' || obj.locale === 'auto'
      ? obj.locale
      : DEFAULT_SETTINGS.locale;
  return {
    skinsmonkeyMode: mode,
    locale,
    rareSubmode: obj.rareSubmode === 'pattern' ? 'pattern' : 'sticker',
    profit: normalizeProfit(obj.profit),
    overlay: obj.overlay ?? {},
  };
}

/** Coerce a stored profit blob to valid ProfitParams (clamps + defaults). */
function normalizeProfit(raw: unknown): ProfitParams {
  const p = (raw ?? {}) as Partial<ProfitParams>;
  const d = DEFAULT_PROFIT_PARAMS;
  // Fractions clamp to [0, 0.95] (a 100% fee is nonsensical); threshold ≥ 0.
  const frac = (v: unknown, def: number): number =>
    typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(0.95, v)) : def;
  const usd = (v: unknown, def: number): number =>
    typeof v === 'number' && isFinite(v) && v >= 0 ? v : def;
  return {
    sellFeeUnder: frac(p.sellFeeUnder, d.sellFeeUnder),
    sellFeeOver: frac(p.sellFeeOver, d.sellFeeOver),
    sellFeeThreshold: usd(p.sellFeeThreshold, d.sellFeeThreshold),
    withdrawFee: frac(p.withdrawFee, d.withdrawFee),
    tradeLockDiscount: frac(p.tradeLockDiscount, d.tradeLockDiscount),
  };
}

export async function getSettings(): Promise<Settings> {
  const r = (await chrome.storage.local.get(KEY_SETTINGS)) as Partial<Pick<StoreShape, 'settings'>>;
  return normalizeSettings(r.settings);
}

export async function setSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY_SETTINGS]: s });
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await getSettings();
  const next: Settings = {
    skinsmonkeyMode:
      patch.skinsmonkeyMode !== undefined ? patch.skinsmonkeyMode : cur.skinsmonkeyMode,
    locale: patch.locale !== undefined ? patch.locale : cur.locale,
    rareSubmode: patch.rareSubmode !== undefined ? patch.rareSubmode : cur.rareSubmode,
    profit: patch.profit !== undefined ? normalizeProfit(patch.profit) : cur.profit,
    overlay: { ...cur.overlay, ...(patch.overlay ?? {}) },
  };
  await setSettings(next);
  return next;
}

/** Sliding 24h window for the popup's "Today's hits" feed. */
export const HITS_TTL_MS = 24 * 60 * 60 * 1000;
/** Maximum kept in storage. Older entries are dropped on read/write. */
export const HITS_MAX_ENTRIES = 30;

export async function getHits(): Promise<TodayHit[]> {
  const r = (await chrome.storage.local.get(KEY_HITS)) as Partial<Pick<StoreShape, 'hits'>>;
  return filterHits(r.hits ?? []);
}

export async function addHit(h: TodayHit): Promise<void> {
  const cur = await getHits();
  const next = [h, ...cur].slice(0, HITS_MAX_ENTRIES);
  await chrome.storage.local.set({ [KEY_HITS]: next });
}

/** Apply sliding-window + cap. Pure function — exposed for tests. */
export function filterHits(all: TodayHit[], now: number = Date.now()): TodayHit[] {
  const floor = now - HITS_TTL_MS;
  return all.filter((h) => typeof h.ts === 'number' && h.ts >= floor).slice(0, HITS_MAX_ENTRIES);
}

/**
 * Explicit garbage collection — call from the service-worker on startup and
 * install so the stored array never grows unbounded if no new hit ever lands.
 * (addHit() already prunes on write, but a quiet user could leave stale data
 * in storage indefinitely.)
 */
export async function runHitsGc(): Promise<void> {
  const r = (await chrome.storage.local.get(KEY_HITS)) as Partial<Pick<StoreShape, 'hits'>>;
  const filtered = filterHits(r.hits ?? []);
  await chrome.storage.local.set({ [KEY_HITS]: filtered });
}

export async function getPendingArbitrage(): Promise<StoreShape['pending_arbitrage']> {
  const r = (await chrome.storage.local.get(KEY_PENDING)) as Partial<
    Pick<StoreShape, 'pending_arbitrage'>
  >;
  return r.pending_arbitrage ?? null;
}

export async function setPendingArbitrage(payload: ExportPayload): Promise<void> {
  await chrome.storage.local.set({
    [KEY_PENDING]: { payload, storedAt: Date.now() },
  });
}

export async function clearPendingArbitrage(): Promise<void> {
  await chrome.storage.local.remove(KEY_PENDING);
}

/** Subscribe to settings changes; returns an unsubscribe fn. */
export function onSettingsChanged(cb: (next: Settings) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area !== 'local' || !changes[KEY_SETTINGS]) return;
    cb(normalizeSettings(changes[KEY_SETTINGS].newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
