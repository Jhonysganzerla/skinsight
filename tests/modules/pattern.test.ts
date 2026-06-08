/**
 * Rare Pattern detection (v0.9). Exercises the real bundled bank
 * (public/rare_patterns.json) through the pure detector + the finder.
 */
import { describe, it, expect } from 'vitest';
import bankJson from '../../public/rare_patterns.json';
import { patternKey, type PatternSkin } from '../../src/modules/rare/pattern-data';
import {
  detectPatternForSkin,
  findPatternResults,
  isKnifeOrGlove,
} from '../../src/modules/rare/pattern-finder';
import type { PatternInput } from '../../src/modules/rare/types';

const skins = (bankJson as { skins: PatternSkin[] }).skins;
const bank = new Map<string, PatternSkin>(skins.map((s) => [patternKey(s.name), s]));
const skin = (name: string): PatternSkin => {
  const s = bank.get(patternKey(name));
  if (!s) throw new Error('missing bank skin: ' + name);
  return s;
};

describe('patternKey', () => {
  it('strips StatTrak™ / ★ / Souvenir prefix and the wear suffix', () => {
    expect(patternKey('StatTrak™ AK-47 | Case Hardened (Field-Tested)')).toBe(
      'ak-47 | case hardened',
    );
    expect(patternKey('AWP | Fade (Factory New)')).toBe('awp | fade');
    expect(patternKey('★ Karambit | Fade (Minimal Wear)')).toBe('karambit | fade');
  });
});

describe('detectPatternForSkin — case-hardened / art-position (seed-list)', () => {
  it('AK-47 seed 151 → Blue Gem T1', () => {
    const m = detectPatternForSkin(skin('AK-47 | Case Hardened'), 151);
    expect(m?.tier).toBe(1);
    expect(m?.tierLabel).toMatch(/T1/);
  });

  it('Desert Eagle seed 490 → Blue Gem T1', () => {
    const m = detectPatternForSkin(skin('Desert Eagle | Heat Treated'), 490);
    expect(m?.tier).toBe(1);
  });

  it('Desert Eagle seed 4 → Gold Pattern variant (tier null)', () => {
    const m = detectPatternForSkin(skin('Desert Eagle | Heat Treated'), 4);
    expect(m?.tier).toBeNull();
    expect(m?.tierLabel).toMatch(/gold/i);
  });

  it('Galil Phoenix Blacklight seed 169 → T1', () => {
    const m = detectPatternForSkin(skin('Galil AR | Phoenix Blacklight'), 169);
    expect(m?.tier).toBe(1);
  });

  it('a non-listed seed → no match', () => {
    expect(detectPatternForSkin(skin('AK-47 | Case Hardened'), 999999)).toBeNull();
  });
});

describe('detectPatternForSkin — fade (computed)', () => {
  it('AWP Fade seed 412 → 100% (flagged)', () => {
    const m = detectPatternForSkin(skin('AWP | Fade'), 412);
    expect(m?.fadePct).toBe(100);
    expect(m?.tierLabel).toMatch(/100.*fade/i);
  });

  it('prefers a site-provided fade % when present', () => {
    const m = detectPatternForSkin(skin('AWP | Fade'), 1, 97.3);
    expect(m?.fadePct).toBe(97.3);
  });

  it('below the 95% flag → no match', () => {
    const m = detectPatternForSkin(skin('AWP | Fade'), 1, 80);
    expect(m).toBeNull();
  });
});

describe('isKnifeOrGlove', () => {
  it('excludes ★ names and Knife/Glove categories', () => {
    expect(isKnifeOrGlove({ marketHashName: '★ Karambit | Fade' })).toBe(true);
    expect(isKnifeOrGlove({ marketHashName: 'X', category: 'Knife' })).toBe(true);
    expect(isKnifeOrGlove({ marketHashName: 'X', category: 'Sport Gloves' })).toBe(true);
    expect(isKnifeOrGlove({ marketHashName: 'AK-47 | Case Hardened' })).toBe(false);
  });
});

describe('findPatternResults', () => {
  const input = (over: Partial<PatternInput>): PatternInput => ({
    id: 'i',
    name: 'x',
    marketHashName: 'x',
    image: null,
    price: 0,
    exterior: '',
    inspectUrl: '',
    paintSeed: null,
    ...over,
  });

  it('matches a weapon hit, skips no-match, knife and seedless', async () => {
    const items: PatternInput[] = [
      input({ id: 'ak', marketHashName: 'AK-47 | Case Hardened (Field-Tested)', paintSeed: 151 }),
      input({ id: 'awp', marketHashName: 'AWP | Fade (Factory New)', paintSeed: 412 }),
      input({ id: 'hb', marketHashName: 'AK-47 | Hyper Beast (Minimal Wear)', paintSeed: 151 }),
      input({ id: 'knife', marketHashName: '★ Karambit | Fade (Factory New)', paintSeed: 412 }),
      input({ id: 'noseed', marketHashName: 'AK-47 | Case Hardened', paintSeed: null }),
    ];
    const out = await findPatternResults(items, bank);
    const ids = out.map((r) => r.id).sort();
    expect(ids).toEqual(['ak', 'awp']);
    const ak = out.find((r) => r.id === 'ak');
    expect(ak?.tier).toBe(1);
    expect(ak?.link).toContain('csfloat.com/search');
    expect(ak?.link).toContain('paint_seed=151');
  });
});
