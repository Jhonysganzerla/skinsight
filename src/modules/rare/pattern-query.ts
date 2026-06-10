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
import { t } from '../shared/i18n';
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

/** Outcome of a pattern hunt — results PLUS the health of the run, so the UI
 *  can distinguish "really 0 hits" from "the queries failed/were throttled". */
export interface PatternQueryReport {
  results: PatternResult[];
  totalSkins: number;
  /** Skins whose query threw (network/HTTP/CSRF) — silently skipping these
   *  made mass failure look like a clean "0 patterns found". */
  failedSkins: number;
  /** PS only: skins whose autocomplete resolved ZERO hashcodes. When this is
   *  100% the PS API likely changed (out-of-stock skins still resolve codes). */
  noHashcodeSkins: number;
  /** PS only: at least one seed chunk gave up on a persistent throttle. */
  throttled: boolean;
  /** The hunt was stopped by the user — results are partial. */
  aborted: boolean;
}

/**
 * Run the targeted pattern hunt: one name query per bank skin, seeds filtered
 * locally by the same detector the scan path uses. Per-skin fetch errors skip
 * that skin (partial results beat none) but are COUNTED in the report; abort
 * stops between skins and still returns everything collected so far.
 */
export async function queryPatternResults(
  site: PatternQuerySite,
  opts: PatternQueryOpts = {},
): Promise<PatternQueryReport> {
  const skins = [...(await getPatternMap()).values()];
  const inputs: PatternInput[] = [];
  let failedSkins = 0;
  let noHashcodeSkins = 0;
  let throttled = false;
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
        const items = await collectPsByName(skin.name, psFilterFor(skin), {
          ...collectorOpts,
          onMeta: (m) => {
            if (m.hashcodes === 0) noHashcodeSkins++;
            if (m.throttled) throttled = true;
          },
        });
        inputs.push(...items.map(rareItemToPatternInput));
      } else {
        const items = await collectCsMoneyByName(skin.name, collectorOpts);
        inputs.push(...items.map(csMoneyItemToPatternInput));
      }
    } catch {
      // Partial results beat none — but count it so the UI can say so.
      failedSkins++;
    }
    if (i + 1 < skins.length) await sleep(BETWEEN_SKINS_MS);
  }
  // Dedupe: CS.Money's name= is a substring match and bank names can overlap
  // ("MAC-10 | Fade" ⊂ queries for other MAC-10 skins) — the same asset must
  // not become two cards. Key by site asset id, falling back to name+seed.
  const seen = new Set<string>();
  const unique = inputs.filter((it) => {
    const key = it.id ? `id:${it.id}` : `nm:${it.marketHashName}#${it.paintSeed}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    results: await findPatternResults(unique),
    totalSkins: skins.length,
    failedSkins,
    noHashcodeSkins,
    throttled,
    aborted: opts.signal?.aborted === true,
  };
}

/**
 * Render the report into the status line shown after a hunt. Centralized so
 * the 3 sites tell the same story: partial on stop, failed-query count,
 * throttle note, and an explicit error when PS resolves zero hashcodes for
 * every skin (API change — out-of-stock skins still resolve codes).
 */
export function patternStatus(rep: PatternQueryReport): {
  text: string;
  kind: 'ok' | 'info' | 'err';
} {
  if (
    rep.noHashcodeSkins > 0 &&
    rep.totalSkins > 0 &&
    rep.noHashcodeSkins === rep.totalSkins &&
    rep.results.length === 0 &&
    !rep.aborted
  ) {
    return { text: t('ps.apiChanged'), kind: 'err' };
  }
  const parts = [
    rep.aborted
      ? t('pattern.partial', { n: rep.results.length })
      : t('pattern.found', { n: rep.results.length }),
  ];
  if (rep.failedSkins > 0) parts.push(t('pattern.failedSkins', { m: rep.failedSkins }));
  if (rep.throttled) parts.push(t('pattern.throttled'));
  const degraded = rep.aborted || rep.failedSkins > 0 || rep.throttled;
  return { text: parts.join(' · '), kind: degraded ? 'info' : 'ok' };
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
