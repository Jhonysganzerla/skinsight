/**
 * Query-by-name Rare Pattern engine (v0.9.1, PS added in v0.9.2).
 *
 * The v0.9 detect path piggybacked the full-inventory rare-sticker scan —
 * which misses any bank skin that doesn't surface inside the page cap. This
 * flips the strategy (per the maintainer's call): for EACH skin in the bank,
 * query the marketplace by name and seed-filter just those listings. ~50
 * targeted queries find every listing of the relevant skins.
 *
 * Per site:
 *   - SkinsMonkey: /api/inventory `q=` search (same one the arbitrage scanner
 *     uses) — collectSmByName; seeds filtered locally.
 *   - CS.Money:    load_bots_inventory `name=` — collectCsMoneyByName (no
 *     hasRareStickers, keeps sticker-less items); seeds filtered locally.
 *   - PirateSwap:  two-step autocomplete → search with hashcodes; seeds
 *     (`pattern=`) and fade (`fadeFrom=`) filtered BY THE SERVER —
 *     collectPsByName. (Fase A thought the hashcodes were non-derivable;
 *     they are — but the site's own autocomplete endpoint hands them out.)
 */
import { sleep } from '../shared/fmt';
import { getPatternMap, type PatternSkin } from './pattern-data';
import {
  csMoneyItemToPatternInput,
  findPatternResults,
  rareItemToPatternInput,
} from './pattern-finder';
import { collectPsByName, collectSmByName, type PsQueryFilter } from './finder';
import { collectCsMoneyByName } from './csmoney';
import type { PatternInput, PatternResult } from './types';

export type PatternQuerySite = 'skinsmonkey' | 'csmoney' | 'pirateswap';

/** Pause between per-skin queries — politeness, not throttle-driven. */
const BETWEEN_SKINS_MS = 350;

/** All bank seeds of a seed-list skin (tiers + variants), deduped. */
export function skinSeeds(skin: PatternSkin): number[] {
  const seeds = new Set<number>();
  for (const t of skin.tiers ?? []) for (const s of t.seeds) seeds.add(s);
  for (const key of Object.keys(skin.variants ?? {})) {
    for (const s of skin.variants?.[key]?.seeds ?? []) seeds.add(s);
  }
  return [...seeds];
}

/** Server-side filter for the PS search: exact seeds, or a fade floor. */
export function psFilterFor(skin: PatternSkin): PsQueryFilter {
  if (skin.method === 'seed-list') return { seeds: skinSeeds(skin) };
  return { fadeFrom: skin.thresholds?.flag_min_pct ?? 95 };
}

export interface PatternQueryOpts {
  signal?: { aborted: boolean };
  /**
   * Progress callback: (1-based skin index, total skins, skin display name,
   * 1-based PAGE within that skin's query). The counter i/total advances per
   * SKIN; `page` ticks while a single skin spans multiple result pages — so
   * the UI never looks frozen on a multi-page skin.
   */
  onProgress?: (i: number, total: number, skinName: string, page: number) => void;
}

/**
 * Run the targeted pattern hunt: one name query per bank skin, seeds filtered
 * locally by the same detector the scan path uses. Per-skin fetch errors skip
 * that skin (partial results beat none); abort stops between skins.
 */
export async function queryPatternResults(
  site: PatternQuerySite,
  opts: PatternQueryOpts = {},
): Promise<PatternResult[]> {
  const skins = [...(await getPatternMap()).values()];
  const inputs: PatternInput[] = [];
  for (let i = 0; i < skins.length; i++) {
    if (opts.signal?.aborted) break;
    const skin = skins[i]!;
    opts.onProgress?.(i + 1, skins.length, skin.name, 1);
    const collectorOpts = {
      ...(opts.signal ? { signal: opts.signal } : {}),
      onPage: (page: number) => opts.onProgress?.(i + 1, skins.length, skin.name, page),
    };
    try {
      if (site === 'skinsmonkey') {
        const items = await collectSmByName(skin.name, collectorOpts);
        inputs.push(...items.map(rareItemToPatternInput));
      } else if (site === 'pirateswap') {
        const items = await collectPsByName(skin.name, psFilterFor(skin), collectorOpts);
        inputs.push(...items.map(rareItemToPatternInput));
      } else {
        const items = await collectCsMoneyByName(skin.name, collectorOpts);
        inputs.push(...items.map(csMoneyItemToPatternInput));
      }
    } catch {
      // Partial results beat none — a failing skin query must not kill the hunt.
    }
    if (i + 1 < skins.length) await sleep(BETWEEN_SKINS_MS);
  }
  return findPatternResults(inputs);
}

/**
 * Search link back into the marketplace the item was found on, so a hit can be
 * located (and bought) where it lives. ⚠ The query-parameter names are
 * best-effort (sites don't document them) — validated by smoke, cheap to fix.
 */
export function siteSearchUrl(
  site: 'skinsmonkey' | 'pirateswap' | 'csmoney',
  marketHashName: string,
): string {
  const q = encodeURIComponent(marketHashName);
  switch (site) {
    case 'skinsmonkey':
      return `https://skinsmonkey.com/trade?appId=730&sort=price-desc&q=${q}`;
    case 'pirateswap':
      return `https://pirateswap.com/?search=${q}`;
    case 'csmoney':
      return `https://cs.money/market/buy/?search=${q}`;
  }
}
