/**
 * wearCode (v0.7) — wear/float abbreviation for the card name badge.
 */
import { describe, it, expect } from 'vitest';
import { wearCode } from '../../src/modules/shared/fmt';

describe('wearCode', () => {
  it('maps exterior strings to abbreviations', () => {
    expect(wearCode('Factory New')).toBe('FN');
    expect(wearCode('Minimal Wear')).toBe('MW');
    expect(wearCode('Field-Tested')).toBe('FT');
    expect(wearCode('Well-Worn')).toBe('WW');
    expect(wearCode('Battle-Scarred')).toBe('BS');
  });

  it('derives from a full market_hash_name suffix', () => {
    expect(wearCode('AK-47 | Redline (Field-Tested)')).toBe('FT');
    expect(wearCode('★ Karambit | Doppler (Factory New)')).toBe('FN');
  });

  it("accepts SkinsMonkey's UPPER_SNAKE exterior format", () => {
    expect(wearCode('FACTORY_NEW')).toBe('FN');
    expect(wearCode('MINIMAL_WEAR')).toBe('MW');
    expect(wearCode('FIELD_TESTED')).toBe('FT');
    expect(wearCode('WELL_WORN')).toBe('WW');
    expect(wearCode('BATTLE_SCARRED')).toBe('BS');
  });

  it('returns empty string when there is no wear', () => {
    expect(wearCode('Sticker | Howling Dawn')).toBe('');
    expect(wearCode('')).toBe('');
  });
});
