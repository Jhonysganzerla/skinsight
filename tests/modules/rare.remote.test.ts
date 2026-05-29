/**
 * Remote rare-list validation guard. `isValidRareList` is the gate that keeps
 * a malformed / truncated / wrong-shape publish from poisoning the cache —
 * `rare-data.ts` only prefers the remote list when this passes, otherwise it
 * falls back to the bundled file. Pure function; no chrome/fetch needed.
 */
import { describe, it, expect } from 'vitest';
import { isValidRareList } from '../../src/modules/rare/remote';

describe('isValidRareList', () => {
  it('accepts a well-formed [name, price] list', () => {
    expect(
      isValidRareList([
        ['Sticker | Foo (Holo) | Katowice 2014', 210.5],
        ['Sticker | Bar | Katowice 2015', 12],
      ]),
    ).toBe(true);
  });

  it('rejects an empty array (a cache of nothing is useless — fall back)', () => {
    expect(isValidRareList([])).toBe(false);
  });

  it('rejects non-array input', () => {
    expect(isValidRareList(null)).toBe(false);
    expect(isValidRareList(undefined)).toBe(false);
    expect(isValidRareList({ data: [] })).toBe(false);
    expect(isValidRareList('[]')).toBe(false);
  });

  it('rejects rows that are not [string, number]', () => {
    expect(isValidRareList([['only name']])).toBe(false);
    expect(isValidRareList([[123, 4.5]])).toBe(false);
    expect(isValidRareList([['name', '4.5']])).toBe(false);
    expect(isValidRareList([null])).toBe(false);
  });

  it('tolerates extra trailing columns as long as the first two are right', () => {
    // The published format may grow (e.g. add a tier column); the loader only
    // reads [name, price], so a longer row should still validate.
    expect(isValidRareList([['Sticker | Foo | Katowice 2014', 210.5, 'holo']])).toBe(true);
  });
});
