/**
 * Parity test: feed a sanitized SkinsMonkey inventory page through the
 * scanner pipeline (buildExportPayload), then feed each item + a known
 * CSFloat price through scoreItem(). Verifies the contract end-to-end with
 * fixture data so we can detect drift on either side.
 *
 * Hand-computed expected values are commented next to each assertion.
 */
import { describe, it, expect } from 'vitest';
import smPage from '../fixtures/skinsmonkey-page.json';
import csfResponse from '../fixtures/csfloat-response.json';
import { buildExportPayload, type RawAsset } from '../../src/modules/arbitrage/scanner';
import { scoreItem } from '../../src/modules/arbitrage/score';

describe('arbitrage parity — SM → payload → score', () => {
  const payload = buildExportPayload(smPage.assets as RawAsset[]);

  it('builds 2 items with the expected schema', () => {
    expect(payload.items).toHaveLength(2);
    const [a, b] = payload.items;
    expect(a?.assetId).toBe('FIXTURE-1001');
    expect(a?.marketName).toBe('M4A1-S | Solitude (Factory New)');
    expect(a?.defIndex).toBe(60); // DEF_INDEX['M4A1-S']
    expect(a?.paintSeed).toBe(898);
    expect(a?.smPrice).toBe(5080);
    expect(a?.stickers).toEqual([]);
    expect(a?.charm).toBeNull();

    expect(b?.assetId).toBe('FIXTURE-1002');
    expect(b?.defIndex).toBe(7); // DEF_INDEX['AK-47']
    expect(b?.tradeLock).toBe(true);
    expect(b?.stickers).toHaveLength(2);
    expect(b?.stickers[0]?.name).toBe('Sticker | Howling Dawn');
    expect(b?.stickers[0]?.steamPrice).toBeNull(); // no steam fetch in v0.2
    expect(b?.charm?.name).toBe("Charm | Lil' Squirt");
  });

  it('M4A1-S | Solitude — no accessories, FN, no trade-lock', () => {
    const item = payload.items[0]!;
    const csfPrice = csfResponse.byAssetId['FIXTURE-1001'].data[0]!.price; // 6500
    const r = scoreItem(item, csfPrice, false);
    // grossProfit = 6500 + 0 + 0 − 5080 = 1420
    expect(r.grossProfit).toBeCloseTo(1420, 2);
    // profitPct = 1420 / 5080 * 100 ≈ 27.9527…
    expect(r.profitPct).toBeCloseTo(27.95275590551181, 2);
    // paintWear 0.0599… > 0.01, no trade-lock → score = 1420*0.6 + profitPct*0.4
    const expectedScore = 1420 * 0.6 + r.profitPct * 0.4;
    expect(r.score).toBeCloseTo(expectedScore, 2);
    expect(r.flagStickers).toBe(false);
    expect(r.flagCharm).toBe(false);
    expect(r.estimated).toBe(false);
  });

  it('AK-47 | Redline — trade-locked, has stickers (steamPrice null)', () => {
    const item = payload.items[1]!;
    const csfPrice = csfResponse.byAssetId['FIXTURE-1002'].data[0]!.price; // 4100
    const r = scoreItem(item, csfPrice, false);
    // stickerTotal = (null+null) → 0 * 0.5 = 0 (steam prices not fetched in v0.2)
    expect(r.stickerTotal).toBe(0);
    expect(r.charmTotal).toBe(0);
    // grossProfit = 4100 − 1850 = 2250
    expect(r.grossProfit).toBeCloseTo(2250, 2);
    // profitPct = 2250 / 1850 * 100 ≈ 121.62
    expect(r.profitPct).toBeCloseTo(121.62162162162163, 2);
    // trade-lock halves the score
    const base = 2250 * 0.6 + r.profitPct * 0.4;
    expect(r.score).toBeCloseTo(base * 0.5, 2);
  });

  it('estimated flag flows through when analyzer falls back to predicted_price', () => {
    const item = payload.items[0]!;
    const predicted = csfResponse.byAssetId['FIXTURE-1001'].data[0]!.reference.predicted_price; // 6300
    const r = scoreItem(item, predicted, true);
    expect(r.estimated).toBe(true);
    expect(r.csfPrice).toBe(6300);
  });
});
