/**
 * Ports the 7 score test cases from busca_pattern_cs2/tests/score.test.html
 * verbatim. This pins the algorithm before any refactor.
 *
 * Source of truth: busca_pattern_cs2/src/builder-csf.js → scoreItem()
 * Reference doc: busca_pattern_cs2/README.md §"Algoritmo de Score"
 */
import { describe, it, expect } from 'vitest';
import { scoreItem } from '../../src/modules/arbitrage/score';
import type { ArbitrageItem } from '../../src/modules/arbitrage/types';

/** Helper — fills required ArbitrageItem fields with neutral defaults. */
function mkItem(overrides: Partial<ArbitrageItem>): ArbitrageItem {
  return {
    assetId: '',
    marketName: '',
    source: 'skinsmonkey',
    source_url: '',
    source_item_url: '',
    smPrice: 5000,
    paintSeed: null,
    paintWear: 0.06,
    paintIndex: null,
    defIndex: null,
    exterior: '',
    statTrak: false,
    souvenir: false,
    tradeLock: false,
    tradeLockUntil: null,
    imageUrl: '',
    inspectUrl: '',
    stickers: [],
    charm: null,
    ...overrides,
  };
}

const CLOSE = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.01);

describe('arbitrage/score — legacy parity (7 cases)', () => {
  it('T1: basic profit, no accessories', () => {
    const t1 = scoreItem(mkItem({ smPrice: 5000, paintWear: 0.06 }), 8000, false);
    CLOSE(t1.grossProfit, 3000);
    CLOSE(t1.profitPct, 60);
    CLOSE(t1.score, 3000 * 0.6 + 60 * 0.4);
    expect(t1.flagStickers).toBe(false);
    expect(t1.flagCharm).toBe(false);
    expect(t1.estimated).toBe(false);
  });

  it('T2: stickers worth more than the skin → flagStickers=true', () => {
    const t2 = scoreItem(
      mkItem({
        smPrice: 500,
        stickers: [
          { name: 's1', steamPrice: 2000 },
          { name: 's2', steamPrice: 1000 },
        ],
        paintWear: 0.1,
      }),
      600,
      false,
    );
    CLOSE(t2.stickerTotal, 1500); // (2000 + 1000) * 0.5
    CLOSE(t2.totalValue, 2100); // 600 + 1500
    CLOSE(t2.grossProfit, 1600); // 2100 - 500
    expect(t2.flagStickers).toBe(true);
  });

  it('T3: trade lock halves the score', () => {
    const ref = scoreItem(mkItem({ smPrice: 5000, paintWear: 0.06 }), 8000, false);
    const t3 = scoreItem(mkItem({ smPrice: 5000, paintWear: 0.06, tradeLock: true }), 8000, false);
    CLOSE(t3.score, ref.score * 0.5);
  });

  it('T4: float < 0.01 multiplies score by 1.3', () => {
    const ref = scoreItem(mkItem({ smPrice: 5000, paintWear: 0.06 }), 8000, false);
    const t4 = scoreItem(mkItem({ smPrice: 5000, paintWear: 0.005 }), 8000, false);
    CLOSE(t4.score, ref.score * 1.3);
  });

  it('T5: negative profit clamps score at 0', () => {
    const t5 = scoreItem(mkItem({ smPrice: 5000, paintWear: 0.06 }), 3000, false);
    expect(t5.score).toBe(0);
    CLOSE(t5.grossProfit, -2000);
  });

  it('T6: charm worth more than the skin → flagCharm=true', () => {
    const t6 = scoreItem(
      mkItem({
        smPrice: 500,
        charm: { name: 'c', steamPrice: 1000 },
        paintWear: 0.06,
      }),
      600,
      false,
    );
    CLOSE(t6.charmTotal, 850); // 1000 * 0.85
    CLOSE(t6.totalValue, 1450); // 600 + 850
    expect(t6.flagCharm).toBe(true);
  });

  it('T7: estimated flag passes through', () => {
    const t7 = scoreItem(mkItem({ smPrice: 5000, paintWear: 0.06 }), 7000, true);
    expect(t7.estimated).toBe(true);
  });
});
