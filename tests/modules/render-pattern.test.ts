/**
 * renderPatternCard (v0.9) — seal/seed/link markup. Pure string builder, so it
 * runs in node without a DOM.
 */
import { describe, it, expect } from 'vitest';
import { renderPatternCard } from '../../src/modules/rare/render-pattern';
import type { PatternResult } from '../../src/modules/rare/types';

const base = (over: Partial<PatternResult>): PatternResult => ({
  id: 'x',
  name: 'AK-47 | Case Hardened (Field-Tested)',
  marketHashName: 'AK-47 | Case Hardened (Field-Tested)',
  image: null,
  price: 120,
  exterior: 'Field-Tested',
  inspectUrl: '',
  paintSeed: 151,
  family: 'case-hardened',
  tierLabel: 'Blue Gem T1 (top)',
  tier: 1,
  fadePct: null,
  link: 'https://csfloat.com/search?market_hash_name=x&paint_seed=151',
  ...over,
});

describe('renderPatternCard', () => {
  it('tier hit: compact T-seal in the action column, full label as a chip', () => {
    const html = renderPatternCard(base({}));
    expect(html).toContain('sh-pattern-seal">T1<');
    expect(html).toContain('Blue Gem T1 (top)'); // full label rides a meta chip
    expect(html).toContain('seed 151');
    expect(html).toContain('https://csfloat.com/search');
    expect(html).toContain(' hot'); // T1 → hot variant
    expect(html).toContain('sh-wear'); // FT badge from exterior
  });

  it('Deagle gold variant: seal shows the short variant name', () => {
    const html = renderPatternCard(base({ tier: null, tierLabel: 'Gold Pattern', paintSeed: 4 }));
    expect(html).toContain('sh-pattern-seal">Gold<');
    expect(html).toContain('Gold Pattern');
  });

  it('fade hit: seal shows the % and ≥99% is hot', () => {
    const html = renderPatternCard(
      base({ tier: null, tierLabel: '100% fade', fadePct: 100, paintSeed: 412 }),
    );
    expect(html).toContain('sh-pattern-seal">100%<');
    expect(html).toContain(' hot');
  });

  it('escapes the item name (no raw HTML injection)', () => {
    const html = renderPatternCard(base({ name: '<img src=x onerror=1>' }));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});
