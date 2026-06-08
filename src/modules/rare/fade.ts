/**
 * Fade-percentage wrapper (v0.9 Rare Pattern).
 *
 * Computes the exact fade % of a skin from its paint seed via
 * `csgo-fade-percentage-calculator`. Used for the SM/CS.Money detect path
 * (PirateSwap already returns `fadePercentage`, so callers prefer that).
 *
 * The library exposes three calculator instances — one per finish family —
 * each with its own supported-weapon list and config. We pick the calculator
 * by the skin's `finish` ("Fade" / "Amber Fade" / "Acid Fade"). Our bank's
 * weapon names match the library's keys 1:1 (verified), so no remap is needed.
 */
import {
  FadeCalculator,
  AmberFadeCalculator,
  AcidFadeCalculator,
} from 'csgo-fade-percentage-calculator';

interface Calc {
  getFadePercentage(
    weapon: string,
    seed: number,
  ): { seed: number; percentage: number; ranking: number };
  getSupportedWeapons(): unknown[];
}

const BY_FINISH: Record<string, Calc> = {
  Fade: FadeCalculator,
  'Amber Fade': AmberFadeCalculator,
  'Acid Fade': AcidFadeCalculator,
};

export interface FadeInfo {
  /** 0..100, rounded by the library. */
  percentage: number;
  /** 1 = the best (Absolute Max) seed for this weapon. */
  ranking: number;
}

/**
 * Fade % for a (finish, weapon, seed). Returns null when the finish isn't a
 * fade family, the weapon isn't supported by that calculator, or the seed is
 * invalid — callers treat null as "not a fade hit".
 */
export function fadePercentage(finish: string, weapon: string, seed: number): FadeInfo | null {
  const calc = BY_FINISH[finish];
  if (!calc || !Number.isFinite(seed)) return null;
  try {
    const supported = calc.getSupportedWeapons().map((w) => String(w));
    if (!supported.includes(weapon)) return null;
    const r = calc.getFadePercentage(weapon, seed);
    return { percentage: r.percentage, ranking: r.ranking };
  } catch {
    return null;
  }
}
