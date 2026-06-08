/**
 * Rare Pattern detector (v0.9) — scan-and-detect.
 *
 * Runs over the SAME inventory items the rare-sticker scan already collects
 * (each carries `paintSeed` now). For each weapon item, looks up the bank by
 * market-hash-name and checks the seed:
 *   - case-hardened / art-position: seed → tier (or Deagle gold/purple variant).
 *   - fade: % from the seed (PirateSwap provides it; SM/CS.Money compute via the
 *     fade lib), flagged at the bank's `flag_min_pct` (default 95%).
 * Knives/gloves are excluded (weapon-only). No $ value — pattern overpay is fuzzy;
 * the card links out to CSFloat (name + seed) for verification.
 */
import { buildCsfUrl } from '../arbitrage/csf-url';
import { fadePercentage } from './fade';
import {
  getPatternMap,
  lookupPatternSkin,
  type PatternSkin,
  type PatternFamily,
} from './pattern-data';
import type { PatternInput, PatternResult, RareItem } from './types';

/** Adapt a RareItem (SkinsMonkey / PirateSwap) to the pattern finder's input. */
export function rareItemToPatternInput(it: RareItem): PatternInput {
  return {
    id: it.id,
    name: it.name,
    marketHashName: it.marketHashName || it.name,
    image: it.image,
    price: it.price,
    exterior: it.exterior,
    inspectUrl: it.inspectUrl,
    paintSeed: it.paintSeed,
    fadePercentage: it.fadePercentage ?? null,
    category: it.category ?? null,
  };
}

export interface PatternMatch {
  family: PatternFamily;
  /** "Blue Gem T1 (top)" / "Gold Pattern" / "98.4% fade". */
  tierLabel: string;
  /** Tier number for seed-list hits; null for variants and fade. */
  tier: number | null;
  /** Fade % for fade hits; null otherwise. */
  fadePct: number | null;
}

/**
 * Match a single seed against one bank skin. Pure — exported for tests.
 * `siteFadePct` is PirateSwap's pre-computed % (preferred when present).
 */
export function detectPatternForSkin(
  skin: PatternSkin,
  paintSeed: number,
  siteFadePct?: number | null,
): PatternMatch | null {
  if (skin.method === 'fade-calc') {
    let pct: number | null =
      typeof siteFadePct === 'number' && Number.isFinite(siteFadePct) ? siteFadePct : null;
    if (pct == null) {
      const f = fadePercentage(skin.finish, skin.weapon, paintSeed);
      pct = f ? f.percentage : null;
    }
    if (pct == null) return null;
    const flag = skin.thresholds?.flag_min_pct ?? 95;
    if (pct < flag) return null;
    const shown = Math.round(pct * 10) / 10;
    return { family: skin.family, tierLabel: `${shown}% fade`, tier: null, fadePct: pct };
  }
  for (const t of skin.tiers ?? []) {
    if (t.seeds.includes(paintSeed)) {
      return { family: skin.family, tierLabel: t.label, tier: t.tier, fadePct: null };
    }
  }
  for (const key of Object.keys(skin.variants ?? {})) {
    const v = skin.variants?.[key];
    if (v && v.seeds.includes(paintSeed)) {
      return { family: skin.family, tierLabel: v.label, tier: null, fadePct: null };
    }
  }
  return null;
}

/** Weapon-only guard: knives and gloves both carry the ★ prefix; PirateSwap
 *  also tags them via `category`. Excluded always (the bank is weapon-only). */
export function isKnifeOrGlove(input: {
  marketHashName: string;
  category?: string | null;
}): boolean {
  const cat = (input.category ?? '').toLowerCase();
  if (cat.includes('knife') || cat.includes('glove')) return true;
  return /^\s*★/.test(input.marketHashName);
}

const YIELD_EVERY_MS = 50;
function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Build the pattern hit set from collected items. `mapOverride` lets tests
 * inject a bank without chrome.runtime.getURL + fetch. Yields to the event loop
 * by elapsed time so a big PirateSwap scan doesn't freeze the overlay (mirrors
 * findRareResults).
 */
export async function findPatternResults(
  items: PatternInput[],
  mapOverride?: Map<string, PatternSkin>,
): Promise<PatternResult[]> {
  const map = mapOverride ?? (await getPatternMap());
  const out: PatternResult[] = [];
  let lastYield = Date.now();
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const seed = it.paintSeed;
    if (seed != null && Number.isFinite(seed) && !isKnifeOrGlove(it)) {
      const skin = lookupPatternSkin(map, it.marketHashName);
      if (skin) {
        const m = detectPatternForSkin(skin, seed, it.fadePercentage ?? null);
        if (m) {
          out.push({
            ...it,
            paintSeed: seed,
            family: m.family,
            tierLabel: m.tierLabel,
            tier: m.tier,
            fadePct: m.fadePct,
            link: buildCsfUrl(seed, it.marketHashName),
          });
        }
      }
    }
    if (i + 1 < items.length && Date.now() - lastYield >= YIELD_EVERY_MS) {
      await nextTick();
      lastYield = Date.now();
    }
  }
  return out;
}
