/**
 * SM→CS.Money net-profit estimate (v0.8 T1).
 *   proceeds = valor × (1 − tradeLockDiscount) × (1 − sellFee) × (1 − withdrawFee)
 *   net      = proceeds − cost     (sellFee tiered at the USD threshold)
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  estimateNetProfit,
  sellFeeFor,
  setProfitParams,
  getProfitParams,
} from '../../src/modules/shared/profit';
import { DEFAULT_PROFIT_PARAMS } from '../../src/modules/shared/storage';

afterEach(() => setProfitParams(DEFAULT_PROFIT_PARAMS));

describe('sellFeeFor (tiered)', () => {
  it('uses the under-threshold rate below the boundary, over-rate at/above', () => {
    expect(sellFeeFor(999.99)).toBe(0.05);
    expect(sellFeeFor(1000)).toBe(0.03);
    expect(sellFeeFor(5000)).toBe(0.03);
  });
});

describe('estimateNetProfit (defaults: 5%/3% @ $1000, no withdraw, no lock)', () => {
  it('cheap item: fee on the whole sale can exceed a small overpay → negative', () => {
    // value 105 (cost 100 + $5 overpay), 5% fee → proceeds 99.75 → net −0.25.
    expect(estimateNetProfit(100, 105)).toBeCloseTo(-0.25, 2);
  });

  it('overpay big enough to clear the fee → positive', () => {
    // value 120, 5% → 114; cost 100 → net +14.
    expect(estimateNetProfit(100, 120)).toBeCloseTo(14, 6);
  });

  it('expensive item uses the 3% tier', () => {
    // value 2000 → 3% → 1940; cost 1990 → net −50.
    expect(estimateNetProfit(1990, 2000)).toBeCloseTo(-50, 6);
  });

  it('clamps negative inputs to 0', () => {
    expect(estimateNetProfit(-10, -10)).toBe(0);
  });
});

describe('estimateNetProfit (configured fees)', () => {
  it('applies withdrawFee and tradeLockDiscount multiplicatively', () => {
    setProfitParams({
      sellFeeUnder: 0.1,
      sellFeeOver: 0.1,
      sellFeeThreshold: 1000,
      withdrawFee: 0.05,
      tradeLockDiscount: 0.2,
    });
    // value 100 × 0.8 (lock) × 0.9 (sell) × 0.95 (withdraw) = 68.4; cost 50 → 18.4
    expect(estimateNetProfit(50, 100)).toBeCloseTo(18.4, 6);
    expect(getProfitParams().withdrawFee).toBe(0.05);
  });
});
