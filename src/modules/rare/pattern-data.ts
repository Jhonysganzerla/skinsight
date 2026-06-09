/**
 * Loads the bundled rare paint-seed bank (`public/rare_patterns.json`) for the
 * Rare Pattern mode (v0.9). Weapon-only — knives/gloves are not in the bank.
 *
 * Mirrors `rare-data.ts`: fetch the bundled file via `chrome.runtime.getURL`,
 * build a lookup Map keyed by a normalized market-hash-name (StatTrak™/★/
 * Souvenir prefixes + wear suffix stripped) → the skin entry. There is no
 * remote layer — the bank is small and ships with the extension.
 */

export type PatternFamily = 'case-hardened' | 'fade' | 'art-position' | 'color-gem';

export interface PatternTier {
  tier: number;
  label: string;
  seeds: number[];
}

export interface PatternVariant {
  label: string;
  seeds: number[];
}

export interface PatternSkin {
  weapon: string;
  finish: string;
  /** Canonical market hash name without wear, e.g. "AK-47 | Case Hardened". */
  name: string;
  family: PatternFamily;
  method: 'seed-list' | 'fade-calc';
  /** seed-list families (case-hardened, art-position). */
  tiers?: PatternTier[];
  /** Extra seed buckets (Desert Eagle Heat Treated: gold / purple). */
  variants?: Record<string, PatternVariant>;
  /** fade family. */
  max_pct_seed?: number;
  thresholds?: { flag_min_pct: number; query_min_pct: number };
}

interface PatternBank {
  skins: PatternSkin[];
}

let _map: Map<string, PatternSkin> | null = null;
let _loadPromise: Promise<Map<string, PatternSkin>> | null = null;

/**
 * Normalize a market hash name to the bank key: drop StatTrak™ / ★ / Souvenir
 * prefixes and the "(Wear)" suffix, trim, lowercase. So
 * "StatTrak™ AK-47 | Case Hardened (Field-Tested)" → "ak-47 | case hardened".
 */
export function patternKey(marketHashName: unknown): string {
  return String(marketHashName ?? '')
    .replace(/^\s*★\s*/, '')
    .replace(/^\s*StatTrak[™™]?\s*/i, '')
    .replace(/^\s*Souvenir\s*/i, '')
    .replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, '')
    .trim()
    .toLowerCase();
}

async function loadOnce(): Promise<Map<string, PatternSkin>> {
  const url = chrome.runtime.getURL('rare_patterns.json');
  const res = await fetch(url);
  if (!res.ok) throw new Error('rare_patterns.json HTTP ' + res.status);
  const bank = (await res.json()) as PatternBank;
  const m = new Map<string, PatternSkin>();
  for (const s of bank.skins ?? []) {
    if (s && typeof s.name === 'string') m.set(patternKey(s.name), s);
  }
  _map = m;
  return m;
}

export async function getPatternMap(): Promise<Map<string, PatternSkin>> {
  if (_map) return _map;
  if (!_loadPromise) _loadPromise = loadOnce();
  return _loadPromise;
}

/** Look up the bank entry for an item's market hash name (null when none). */
export function lookupPatternSkin(
  map: Map<string, PatternSkin>,
  marketHashName: string,
): PatternSkin | undefined {
  return map.get(patternKey(marketHashName));
}
