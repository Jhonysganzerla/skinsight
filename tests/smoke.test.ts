import { describe, it, expect } from 'vitest';
import { fmtCents, fmtPct, esc } from '../src/modules/shared/fmt';

describe('smoke — shared/fmt', () => {
  it('fmtCents formats integer cents', () => {
    expect(fmtCents(1234)).toBe('$12.34');
    expect(fmtCents(null)).toBe('—');
  });
  it('fmtPct formats fractions', () => {
    expect(fmtPct(0.31)).toBe('31%');
  });
  it('esc escapes HTML entities', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
    expect(esc('"quoted"')).toBe('&quot;quoted&quot;');
  });
});
