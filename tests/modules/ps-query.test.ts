/**
 * PirateSwap query-by-name (v0.9.2) — autocomplete → hashcodes → server-side
 * seed/fade filtered search. Fetch fully mocked; URLs asserted against the
 * live captures of 2026-06-10 (Kami / Solitude / MAC-10 Fade).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectPsByName, psResolveHashCodes } from '../../src/modules/rare/finder';
import { psFilterFor, skinSeeds } from '../../src/modules/rare/pattern-query';
import type { PatternSkin } from '../../src/modules/rare/pattern-data';

/* Real autocomplete capture (trimmed): both ST and plain Kami entries. */
const KAMI_AUTOCOMPLETE = [
  {
    marketHashName: 'StatTrak™ Five-SeveN | Kami',
    marketNameHashCodes: [-1570336644, 1633954053, -270379604],
  },
  {
    marketHashName: 'Five-SeveN | Kami',
    marketNameHashCodes: [1159576209, -1909638927, 1024813655],
  },
  { marketHashName: 'Five-SeveN | Kami Dragon', marketNameHashCodes: [42] }, // must NOT match
];

const KAMI_ALL_CODES = [-1570336644, 1633954053, -270379604, 1159576209, -1909638927, 1024813655];

function psItem(seed: number, name = 'Five-SeveN | Kami (Factory New)') {
  return { id: `id-${seed}`, marketHashName: name, price: 1.23, pattern: seed, category: 'Pistol' };
}

/** Install a fetch mock; returns the list of requested URLs. */
function mockFetch(handler: (url: string) => unknown): string[] {
  const urls: string[] = [];
  vi.stubGlobal('fetch', (url: string) => {
    urls.push(url);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(handler(url)) });
  });
  return urls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('psResolveHashCodes', () => {
  it('merges codes from every prefix variant of the same skin, excluding lookalikes', async () => {
    mockFetch(() => KAMI_AUTOCOMPLETE);
    const codes = await psResolveHashCodes('Five-SeveN | Kami');
    expect(codes).toEqual(KAMI_ALL_CODES); // 42 (Kami Dragon) excluded
  });

  it('returns [] when the skin has no autocomplete entry (not stocked)', async () => {
    mockFetch(() => []);
    expect(await psResolveHashCodes('Glock-18 | Fade')).toEqual([]);
  });
});

describe('collectPsByName', () => {
  it('skips the search entirely when no hashcodes resolve', async () => {
    const urls = mockFetch(() => []);
    const out = await collectPsByName('Glock-18 | Fade', { fadeFrom: 95 });
    expect(out).toEqual([]);
    expect(urls).toHaveLength(1); // autocomplete only
  });

  it('sends hashcodes joined + repeated pattern params, and maps items', async () => {
    const urls = mockFetch((url) =>
      url.includes('autocomplete') ? KAMI_AUTOCOMPLETE : { items: [psItem(909)], empty: true },
    );
    const out = await collectPsByName('Five-SeveN | Kami', { seeds: [590, 909, 662] });
    expect(out).toHaveLength(1);
    expect(out[0]!.paintSeed).toBe(909);

    const search = new URL(urls[1]!);
    expect(search.pathname).toBe('/inventory/v2/ExchangerInventory');
    expect(search.searchParams.get('searchPhrase')).toBe('Five-SeveN | Kami');
    expect(search.searchParams.get('marketHashNameHashCodes')).toBe(KAMI_ALL_CODES.join(','));
    expect(search.searchParams.getAll('pattern')).toEqual(['590', '909', '662']);
  });

  it('chunks seed lists above 100 into separate requests', async () => {
    const seeds = Array.from({ length: 276 }, (_, i) => i + 1); // Deagle HT size
    const urls = mockFetch((url) =>
      url.includes('autocomplete') ? KAMI_AUTOCOMPLETE : { items: [], empty: true },
    );
    await collectPsByName('Five-SeveN | Kami', { seeds });
    const searches = urls.slice(1).map((u) => new URL(u).searchParams.getAll('pattern').length);
    expect(searches).toEqual([100, 100, 76]);
  });

  it('uses fadeFrom (no pattern params) for fade skins', async () => {
    const urls = mockFetch((url) =>
      url.includes('autocomplete')
        ? [{ marketHashName: 'MAC-10 | Fade', marketNameHashCodes: [974984200, -1859962848] }]
        : { items: [], empty: true },
    );
    await collectPsByName('MAC-10 | Fade', { fadeFrom: 95 });
    const search = new URL(urls[1]!);
    expect(search.searchParams.get('fadeFrom')).toBe('95');
    expect(search.searchParams.getAll('pattern')).toEqual([]);
  });

  it('stops paging on empty:true and on a short page', async () => {
    let calls = 0;
    mockFetch((url) => {
      if (url.includes('autocomplete')) return KAMI_AUTOCOMPLETE;
      calls++;
      return { items: [psItem(909)], empty: true }; // short page + empty flag
    });
    await collectPsByName('Five-SeveN | Kami', { seeds: [909] });
    expect(calls).toBe(1);
  });
});

describe('psFilterFor / skinSeeds', () => {
  const seedSkin: PatternSkin = {
    weapon: 'Five-SeveN',
    finish: 'Kami',
    name: 'Five-SeveN | Kami',
    family: 'art-position',
    method: 'seed-list',
    tiers: [{ tier: 1, label: 'T1', seeds: [1, 2] }],
    variants: { pussy: { label: 'Pussy', seeds: [2, 909] } },
  };
  const fadeSkin: PatternSkin = {
    weapon: 'Glock-18',
    finish: 'Fade',
    name: 'Glock-18 | Fade',
    family: 'fade',
    method: 'fade-calc',
    thresholds: { flag_min_pct: 97, query_min_pct: 95 },
  };

  it('flattens tiers + variants deduped', () => {
    expect(skinSeeds(seedSkin)).toEqual([1, 2, 909]);
  });

  it('builds seeds filter for seed-list and fadeFrom for fade-calc', () => {
    expect(psFilterFor(seedSkin)).toEqual({ seeds: [1, 2, 909] });
    expect(psFilterFor(fadeSkin)).toEqual({ fadeFrom: 97 });
  });
});
