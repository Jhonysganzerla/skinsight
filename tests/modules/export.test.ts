/** CSV serialization (v0.10) — pure functions, no DOM needed for toCsv. */
import { describe, it, expect } from 'vitest';
import { csvFilename, toCsv } from '../../src/modules/shared/export';

describe('toCsv', () => {
  it('emits headers from the first row, in insertion order', () => {
    const csv = toCsv([
      { name: 'AWP | PAW', price: 10.5, roi: 1.42 },
      { name: 'AK-47 | Case Hardened', price: 99, roi: 2 },
    ]);
    expect(csv).toBe('name,price,roi\nAWP | PAW,10.5,1.42\nAK-47 | Case Hardened,99,2\n');
  });

  it('escapes commas, quotes and newlines', () => {
    const csv = toCsv([{ a: 'x,y', b: 'he said "hi"', c: 'line1\nline2' }]);
    expect(csv).toBe('a,b,c\n"x,y","he said ""hi""","line1\nline2"\n');
  });

  it('renders null/undefined/NaN as empty cells', () => {
    const csv = toCsv([{ a: null, b: undefined, c: NaN, d: 0 }]);
    expect(csv).toBe('a,b,c,d\n,,,0\n');
  });

  it('returns empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });
});

describe('csvFilename', () => {
  it('stamps site, mode and local time', () => {
    const now = new Date(2026, 5, 11, 14, 7); // 2026-06-11 14:07 local
    expect(csvFilename('pirateswap', 'sticker', now)).toBe(
      'skinsight-pirateswap-sticker-20260611-1407.csv',
    );
  });
});
