/**
 * v0.9.0 hardening: pattern-hunt report wording, bank schema validation and
 * the site search-link formats (lock-in — sites don't document the params).
 */
import { describe, expect, it } from 'vitest';
import {
  patternStatus,
  siteSearchUrl,
  type PatternQueryReport,
} from '../../src/modules/rare/pattern-query';
import { isValidPatternSkin, sanitizePatternBank } from '../../src/modules/rare/pattern-data';

const rep = (over: Partial<PatternQueryReport>): PatternQueryReport => ({
  results: [],
  totalSkins: 50,
  failedSkins: 0,
  noHashcodeSkins: 0,
  throttled: false,
  aborted: false,
  ...over,
});

describe('patternStatus', () => {
  it('clean run → ok', () => {
    expect(patternStatus(rep({})).kind).toBe('ok');
  });

  it('100% no-hashcode skins with 0 hits → explicit PS API-change error', () => {
    const st = patternStatus(rep({ noHashcodeSkins: 50 }));
    expect(st.kind).toBe('err');
  });

  it('partial stop keeps results and says so', () => {
    const st = patternStatus(rep({ aborted: true }));
    expect(st.kind).toBe('info');
    expect(st.text).toMatch(/Stopped|Interrompido/);
  });

  it('failed skin queries and throttling are reported, not swallowed', () => {
    const st = patternStatus(rep({ failedSkins: 30, throttled: true }));
    expect(st.kind).toBe('info');
    expect(st.text).toContain('30');
    expect(st.text).toMatch(/rate limit|limite/);
  });
});

describe('pattern bank validation', () => {
  const good = {
    weapon: 'AK-47',
    finish: 'Case Hardened',
    name: 'AK-47 | Case Hardened',
    family: 'case-hardened',
    method: 'seed-list',
    tiers: [{ tier: 1, label: 'T1', seeds: [661, 670] }],
  };

  it('accepts a valid seed-list entry and a fade-calc entry', () => {
    expect(isValidPatternSkin(good)).toBe(true);
    expect(isValidPatternSkin({ name: 'Glock-18 | Fade', method: 'fade-calc' })).toBe(true);
  });

  it('rejects string seeds, unknown methods, and seedless seed-lists', () => {
    expect(isValidPatternSkin({ ...good, tiers: [{ tier: 1, label: 'T1', seeds: ['661'] }] })).toBe(
      false,
    );
    expect(isValidPatternSkin({ ...good, method: 'magic' })).toBe(false);
    expect(isValidPatternSkin({ name: 'X | Y', method: 'seed-list' })).toBe(false);
  });

  it('sanitizePatternBank keeps the valid subset', () => {
    const out = sanitizePatternBank({ skins: [good, { name: 'broken' }, null] });
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('AK-47 | Case Hardened');
    expect(sanitizePatternBank(null)).toEqual([]);
    expect(sanitizePatternBank({ skins: 'nope' })).toEqual([]);
  });
});

describe('siteSearchUrl lock-in', () => {
  it('formats per-site search links (smoke-validated 2026-06)', () => {
    const n = 'Five-SeveN | Kami';
    expect(siteSearchUrl('skinsmonkey', n)).toBe(
      'https://skinsmonkey.com/trade?appId=730&sort=price-desc&q=Five-SeveN%20%7C%20Kami',
    );
    expect(siteSearchUrl('pirateswap', n)).toBe(
      'https://pirateswap.com/?search=Five-SeveN%20%7C%20Kami',
    );
    expect(siteSearchUrl('csmoney', n)).toBe(
      'https://cs.money/market/buy/?search=Five-SeveN%20%7C%20Kami',
    );
  });
});
