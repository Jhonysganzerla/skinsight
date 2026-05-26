/** Typed wrappers over chrome.storage.local. */

import type { ExportPayload } from '../arbitrage/types';

/** Mutually exclusive — the user runs Arbitrage *or* Rare, never both. */
export type ActiveMode = 'arbitrage' | 'rare' | null;

export interface Settings {
  /**
   * The mode the user opted into globally. v0.3 enforces mutex: the popup
   * has two cards but only one is `active` at a time. Per-site relevance is
   * handled by the content scripts (e.g. CSFloat ignores `rare`, PirateSwap
   * ignores `arbitrage`).
   */
  activeMode: ActiveMode;
  /** Overlay state per hostname — minimized + remembered position. */
  overlay: Record<string, { minimized?: boolean; left?: number; top?: number } | undefined>;
}

export const DEFAULT_SETTINGS: Settings = {
  activeMode: 'arbitrage',
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

/** Read settings, applying defaults + a one-time migration from v0.2's
 *  4-boolean `modes` shape (any of {arbitrage_sm, arbitrage_csf} truthy → 'arbitrage'). */
function normalizeSettings(raw: unknown): Settings {
  const obj = (raw ?? {}) as Partial<Settings> & {
    modes?: {
      arbitrage_sm?: boolean;
      arbitrage_csf?: boolean;
      rare_smps?: boolean;
      rare_csm?: boolean;
    };
  };
  let active: ActiveMode = obj.activeMode ?? null;
  if (active === undefined || (active === null && obj.modes)) {
    const m = obj.modes ?? {};
    if (m.arbitrage_sm || m.arbitrage_csf) active = 'arbitrage';
    else if (m.rare_smps || m.rare_csm) active = 'rare';
    else active = DEFAULT_SETTINGS.activeMode;
  }
  return {
    activeMode: active,
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
    activeMode: patch.activeMode !== undefined ? patch.activeMode : cur.activeMode,
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
