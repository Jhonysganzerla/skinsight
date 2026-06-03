/**
 * CS.Money sticker-overpay estimate (v0.7).
 * overpay_est = min(0.07 × Σ(sticker_market_price), 0.25 × skin_price)
 */
import { describe, it, expect } from 'vitest';
import {
  estimateCsMoneyOverpay,
  OVERPAY_STICKER_RATE,
  OVERPAY_SKIN_CAP,
} from '../../src/modules/shared/overpay';

describe('estimateCsMoneyOverpay', () => {
  it('matches the Medusa anchor (sticker-bound, cap does not bite)', () => {
    // Medusa skin $3274 + sticker $58 → 0.07×58 = 4.06 (vs CS.Money real $4.19).
    const est = estimateCsMoneyOverpay(58, 3274);
    expect(est).toBeCloseTo(4.06, 2);
    // Within ~3% of the real figure.
    expect(Math.abs(est - 4.19) / 4.19).toBeLessThan(0.05);
  });

  it('caps at 0.25 × skin_price on a cheap skin with heavy stickers', () => {
    // 0.07×100 = 7 vs cap 0.25×8 = 2 → min = 2 (cap bites).
    expect(estimateCsMoneyOverpay(100, 8)).toBeCloseTo(2, 6);
  });

  it('is sticker-bound when the skin is expensive', () => {
    // 0.07×20 = 1.4 vs cap 0.25×500 = 125 → min = 1.4.
    expect(estimateCsMoneyOverpay(20, 500)).toBeCloseTo(1.4, 6);
  });

  it('returns 0 for no stickers and clamps negatives', () => {
    expect(estimateCsMoneyOverpay(0, 100)).toBe(0);
    expect(estimateCsMoneyOverpay(-5, 100)).toBe(0);
    expect(estimateCsMoneyOverpay(50, -100)).toBe(0);
  });

  it('exposes the calibrated constants', () => {
    expect(OVERPAY_STICKER_RATE).toBe(0.07);
    expect(OVERPAY_SKIN_CAP).toBe(0.25);
  });
});
