/**
 * Bank tightening — 2026-06-10 (maintainer call after the first full smoke).
 *
 * Problem: the pattern hunt surfaced HUNDREDS of low-value hits ("R8 Revolver
 * 170", "P2000 48"…). Two causes, two fixes:
 *
 * 1. FADES — flag_min_pct was 95, but ~26% of ALL 1000 seeds sit at ≥95%
 *    (verified against csgo-fade-percentage-calculator); market premium only
 *    exists near full fade — 95% trades as a common pattern
 *    (steamanalyst.com/guides/fade, cs.money/blog/trade/fade-patterns-what-is-full-fade).
 *    New rule: per-skin threshold = the 10th-best seed's percentage (floored
 *    to 0.1) → each fade skin flags only its ~top-10 seeds.
 *
 * 2. DESERT EAGLE | HEAT TREATED — 276 seeds (full csgobluegem tier lists)
 *    down to the top 3 per gem, per the cross-guide consensus
 *    (skin.land/blog/full-deagle-heat-treated-patterns-guide,
 *     cs.money/blog .../desert-eagle-heat-treated-pattern-guide,
 *     skinlords.com/blog/desert-eagle-heat-treated-pattern-guide):
 *      blue   490 (rank #1 everywhere), 148, 69
 *      purple 172, 599, 156
 *      gold   103, 182, 74
 *
 * Idempotent; run with `node scripts/curate-tighten-2026-06.mjs`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  FadeCalculator,
  AmberFadeCalculator,
  AcidFadeCalculator,
} from 'csgo-fade-percentage-calculator';
const CALCS = {
  Fade: FadeCalculator,
  'Amber Fade': AmberFadeCalculator,
  'Acid Fade': AcidFadeCalculator,
};

const BANK = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'rare_patterns.json');
const bank = JSON.parse(readFileSync(BANK, 'utf8'));

/** Threshold that keeps only the ~top-N seeds of a fade weapon. */
function topNCut(finish, weapon, n = 10) {
  const ps = CALCS[finish]
    .getFadePercentages(weapon)
    .map((x) => x.percentage)
    .sort((a, b) => b - a);
  return Math.floor(ps[Math.min(n - 1, ps.length - 1)] * 10) / 10;
}

let fadesTightened = 0;
for (const s of bank.skins) {
  if (s.method !== 'fade-calc') continue;
  const cut = topNCut(s.finish, s.weapon);
  s.thresholds = { flag_min_pct: cut, query_min_pct: cut };
  s.threshold_rule = 'top-10 seeds (2026-06-10): premium only near full fade';
  fadesTightened++;
}

const deagle = bank.skins.find((s) => s.name === 'Desert Eagle | Heat Treated');
deagle.tiers = [{ tier: 1, label: 'Blue Gem T1 (top)', seeds: [490, 148, 69] }];
deagle.variants = {
  purple: { label: 'Purple Gem', seeds: [172, 599, 156] },
  gold: { label: 'Gold Gem', seeds: [103, 182, 74] },
};
deagle.source =
  'top-3 per gem (2026-06-10) — consensus of skin.land/blog/full-deagle-heat-treated-patterns-guide, ' +
  'cs.money/blog (deagle heat treated pattern guide) and skinlords.com; blue #490 is rank #1 in every guide';

writeFileSync(BANK, JSON.stringify(bank, null, 1) + '\n');
const total = bank.skins.reduce(
  (a, s) =>
    a +
    (s.tiers ?? []).reduce((x, t) => x + t.seeds.length, 0) +
    Object.values(s.variants ?? {}).reduce((x, v) => x + v.seeds.length, 0),
  0,
);
console.log(`fades tightened: ${fadesTightened}; deagle seeds now 9; bank total seeds: ${total}`);
for (const s of bank.skins.filter((x) => x.method === 'fade-calc')) {
  console.log(`  ${s.name}: flag ≥ ${s.thresholds.flag_min_pct}%`);
}
