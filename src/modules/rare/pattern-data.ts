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

export interface PatternBank {
  schema_version?: number;
  skins: PatternSkin[];
}

const VALID_METHODS = new Set(['seed-list', 'fade-calc']);

const isSeedArray = (x: unknown): x is number[] =>
  Array.isArray(x) && x.every((s) => typeof s === 'number' && Number.isFinite(s));

/**
 * Validate one bank entry. The bank is hand-curated + script-merged, so a
 * malformed entry (seed as string, unknown method, missing tiers) must be
 * rejected loudly instead of silently never matching at runtime.
 */
export function isValidPatternSkin(s: unknown): s is PatternSkin {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  if (typeof o['name'] !== 'string' || !o['name'].trim()) return false;
  if (typeof o['method'] !== 'string' || !VALID_METHODS.has(o['method'])) return false;
  if (o['method'] === 'fade-calc') return true; // seeds come from the fade lib
  const tiers = o['tiers'];
  if (tiers !== undefined) {
    if (!Array.isArray(tiers)) return false;
    for (const t of tiers) {
      const to = t as Record<string, unknown>;
      if (!to || typeof to['tier'] !== 'number' || typeof to['label'] !== 'string') return false;
      if (!isSeedArray(to['seeds'])) return false;
    }
  }
  const variants = o['variants'];
  if (variants !== undefined) {
    if (!variants || typeof variants !== 'object') return false;
    for (const v of Object.values(variants)) {
      const vo = v as Record<string, unknown>;
      if (!vo || typeof vo['label'] !== 'string' || !isSeedArray(vo['seeds'])) return false;
    }
  }
  // A seed-list skin with neither tiers nor variants can never match.
  return tiers !== undefined || variants !== undefined;
}

/**
 * Parse an untrusted bank payload (bundled file or remote refresh) into the
 * valid subset of skins. Invalid entries are skipped with a console.warn —
 * one bad merge must not take down the whole detector.
 */
export function sanitizePatternBank(x: unknown): PatternSkin[] {
  const skins = (x as PatternBank | null)?.skins;
  if (!Array.isArray(skins)) return [];
  const out: PatternSkin[] = [];
  for (const s of skins) {
    if (isValidPatternSkin(s)) out.push(s);
    else {
      console.warn(
        '[Skinsight] rare_patterns: skipping invalid bank entry:',
        (s as { name?: unknown })?.name ?? s,
      );
    }
  }
  return out;
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

/** Storage key for the remote-refreshed bank (written by the SW). */
const KEY_PATTERNS_REMOTE = 'patterns_remote';

async function loadOnce(): Promise<Map<string, PatternSkin>> {
  // Prefer the remote-refreshed bank (same file, published on raw GitHub and
  // cached by the SW) so seed fixes reach users without a Store re-review.
  // Fall back to the bundled file on any miss/parse problem.
  let skins: PatternSkin[] = [];
  try {
    const r = (await chrome.storage.local.get(KEY_PATTERNS_REMOTE)) as Record<string, unknown>;
    const cached = (r[KEY_PATTERNS_REMOTE] as { data?: unknown } | undefined)?.data;
    if (cached) skins = sanitizePatternBank(cached);
  } catch {
    /* storage unavailable — bundled fallback below */
  }
  if (!skins.length) {
    const url = chrome.runtime.getURL('rare_patterns.json');
    const res = await fetch(url);
    if (!res.ok) throw new Error('rare_patterns.json HTTP ' + res.status);
    skins = sanitizePatternBank(await res.json());
  }
  const m = new Map<string, PatternSkin>();
  for (const s of skins) m.set(patternKey(s.name), s);
  _map = m;
  return m;
}

export async function getPatternMap(): Promise<Map<string, PatternSkin>> {
  if (_map) return _map;
  if (!_loadPromise) {
    // On rejection, clear the cached promise so the NEXT scan can retry —
    // otherwise one transient failure (e.g. extension context invalidated
    // during an update) poisons every scan until a page reload.
    _loadPromise = loadOnce().catch((e: unknown) => {
      _loadPromise = null;
      throw e;
    });
  }
  return _loadPromise;
}

/** Look up the bank entry for an item's market hash name (null when none). */
export function lookupPatternSkin(
  map: Map<string, PatternSkin>,
  marketHashName: string,
): PatternSkin | undefined {
  return map.get(patternKey(marketHashName));
}
