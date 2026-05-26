/** Typed wrappers over chrome.storage.local. */

import type { ExportPayload } from '../arbitrage/types';

export interface Settings {
  modes: {
    arbitrage_sm: boolean;
    arbitrage_csf: boolean;
    rare_smps: boolean;
    rare_csm: boolean;
  };
  /** Overlay state per hostname — minimized + remembered position. */
  overlay: Record<string, { minimized?: boolean; left?: number; top?: number } | undefined>;
}

export const DEFAULT_SETTINGS: Settings = {
  modes: {
    arbitrage_sm: true,
    arbitrage_csf: true,
    rare_smps: true,
    rare_csm: true,
  },
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

export async function getSettings(): Promise<Settings> {
  const r = (await chrome.storage.local.get(KEY_SETTINGS)) as Partial<Pick<StoreShape, 'settings'>>;
  const s: Partial<Settings> = r.settings ?? {};
  return {
    modes: { ...DEFAULT_SETTINGS.modes, ...(s.modes ?? {}) },
    overlay: s.overlay ?? {},
  };
}

export async function setSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY_SETTINGS]: s });
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await getSettings();
  const next: Settings = {
    modes: { ...cur.modes, ...(patch.modes ?? {}) },
    overlay: { ...cur.overlay, ...(patch.overlay ?? {}) },
  };
  await setSettings(next);
  return next;
}

export async function getHits(): Promise<TodayHit[]> {
  const r = (await chrome.storage.local.get(KEY_HITS)) as Partial<Pick<StoreShape, 'hits'>>;
  const all = r.hits ?? [];
  // Filter to today (UTC) and trim to last 30.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return all.filter((h) => h.ts >= startOfToday.getTime()).slice(0, 30);
}

export async function addHit(h: TodayHit): Promise<void> {
  const cur = await getHits();
  const next = [h, ...cur].slice(0, 30);
  await chrome.storage.local.set({ [KEY_HITS]: next });
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
    cb({
      modes: {
        ...DEFAULT_SETTINGS.modes,
        ...((changes[KEY_SETTINGS].newValue?.modes as Settings['modes']) ?? {}),
      },
      overlay: (changes[KEY_SETTINGS].newValue?.overlay as Settings['overlay']) ?? {},
    });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
