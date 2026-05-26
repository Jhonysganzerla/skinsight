/** Typed wrappers over chrome.storage.local. */

import type { ExportPayload } from '../arbitrage/types';

/** The two modes the extension exposes. */
export type SkinsmonkeyMode = 'arbitrage' | 'rare';

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
  /** Overlay state per hostname — minimized + remembered position. */
  overlay: Record<string, { minimized?: boolean; left?: number; top?: number } | undefined>;
}

export const DEFAULT_SETTINGS: Settings = {
  skinsmonkeyMode: 'rare',
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
  return {
    skinsmonkeyMode: mode,
    overlay: obj.overlay ?? {},
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
