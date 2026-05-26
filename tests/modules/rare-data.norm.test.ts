/**
 * norm() memoization (v0.4.1).
 *
 * Validates: repeated calls with the same input compile the regex once,
 * not N times. We spy on String.prototype.replace to count actual regex
 * applications since the cache short-circuits before we hit replace().
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { norm, __resetNormCache } from '../../src/modules/rare/rare-data';

beforeEach(() => {
  __resetNormCache();
});

describe('rare-data/norm — memoization', () => {
  it('strips "Sticker | " prefix, trims, lowercases', () => {
    expect(norm('Sticker | kennyS (Foil) | Cologne 2015')).toBe(
      'kennys (foil) | cologne 2015',
    );
    expect(norm('  Sticker |   Howling Dawn  ')).toBe('howling dawn');
    expect(norm('NoPrefix Name')).toBe('noprefix name');
    expect(norm(null)).toBe('');
    expect(norm(undefined)).toBe('');
  });

  it('repeated calls with the same input only run the regex once', () => {
    const replaceSpy = vi.spyOn(String.prototype, 'replace');
    // First batch — 50 unique names, called 200 times each.
    const names = Array.from({ length: 50 }, (_, i) => `Sticker | Foo ${i}`);
    for (let pass = 0; pass < 200; pass++) {
      for (const n of names) norm(n);
    }
    // 50 unique → at most 50 regex applications. Allow ~1 spurious slot just
    // to keep the test sturdy against any future internal use of replace().
    expect(replaceSpy.mock.calls.length).toBeLessThanOrEqual(60);
    replaceSpy.mockRestore();
  });

  it('cache miss writes a new entry; second hit is O(1)', () => {
    expect(norm('Sticker | Unique')).toBe('unique');
    const replaceSpy = vi.spyOn(String.prototype, 'replace');
    norm('Sticker | Unique'); // already cached
    expect(replaceSpy).not.toHaveBeenCalled();
    replaceSpy.mockRestore();
  });
});
