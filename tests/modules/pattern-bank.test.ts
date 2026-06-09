/**
 * Bank invariants for public/rare_patterns.json (v0.9) — the CI half of
 * scripts/sweep-patterns.mjs. Guards future bank edits against the failure
 * modes the online sweep surfaced.
 */
import { describe, it, expect } from 'vitest';
import {
  FadeCalculator,
  AmberFadeCalculator,
  AcidFadeCalculator,
} from 'csgo-fade-percentage-calculator';
import bankJson from '../../public/rare_patterns.json';
import type { PatternSkin } from '../../src/modules/rare/pattern-data';
import { fadePercentage } from '../../src/modules/rare/fade';

const skins = (bankJson as { skins: PatternSkin[] }).skins;
interface Calc {
  getFadePercentages(weapon: string): Array<{ seed: number; percentage: number }>;
}
const CALC: Record<string, Calc> = {
  Fade: FadeCalculator,
  'Amber Fade': AmberFadeCalculator,
  'Acid Fade': AcidFadeCalculator,
};

describe('rare_patterns bank — fade family vs the calculator (ground truth)', () => {
  const fades = skins.filter((s) => s.method === 'fade-calc');

  it('has the 14 fade skins', () => {
    expect(fades).toHaveLength(14);
  });

  it.each(fades.map((s) => [s.name, s] as const))(
    '%s: weapon supported and max_pct_seed reaches the true max %%',
    (_name, skin) => {
      const calc = CALC[skin.finish];
      expect(calc, `no calculator for finish ${skin.finish}`).toBeDefined();
      const all = calc!.getFadePercentages(skin.weapon);
      expect(all.length).toBeGreaterThan(0);
      const maxPct = Math.max(...all.map((p) => p.percentage));
      const entry = all.find((p) => p.seed === skin.max_pct_seed);
      expect(entry?.percentage, `max_pct_seed ${skin.max_pct_seed} is not the max`).toBe(maxPct);
    },
  );

  it('reversed-weapon ranking trap: Glock 763 is the 100% seed (NOT ranking-1 seed 412)', () => {
    // The lib carries one ranking-1 entry PER fade direction on reversed
    // weapons — naively taking ranking===1 picks seed 412 at 80%. The sweep
    // and fade.ts must resolve by max percentage instead.
    expect(fadePercentage('Fade', 'Glock-18', 763)?.percentage).toBe(100);
    expect(fadePercentage('Fade', 'Glock-18', 412)?.percentage).toBe(80);
  });
});

describe('rare_patterns bank — seed-list invariants', () => {
  const seedLists = skins.filter((s) => s.method === 'seed-list');

  it.each(seedLists.map((s) => [s.name, s] as const))(
    '%s: non-empty buckets, valid 0..1000 seeds, no duplicates across buckets',
    (_name, skin) => {
      const seen = new Set<number>();
      const buckets = [
        ...(skin.tiers ?? []).map((t) => t.seeds),
        ...Object.values(skin.variants ?? {}).map((v) => v.seeds),
      ];
      expect(buckets.length).toBeGreaterThan(0);
      for (const seeds of buckets) {
        expect(seeds.length).toBeGreaterThan(0);
        for (const s of seeds) {
          expect(Number.isInteger(s) && s >= 0 && s <= 1000, `invalid seed ${s}`).toBe(true);
          expect(seen.has(s), `duplicate seed ${s}`).toBe(false);
          seen.add(s);
        }
      }
    },
  );

  it("Galil Blacklight matches the cited source's #1 (seed 755 in T1)", () => {
    const galil = skins.find((s) => s.name === 'Galil AR | Phoenix Blacklight')!;
    const t1 = galil.tiers!.find((t) => t.tier === 1)!;
    expect(t1.seeds).toContain(755);
  });
});
