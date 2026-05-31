/**
 * Skinport oracle (v0.6). Covers the hard guarantees:
 *   - TTL checked BEFORE any fetch — never calls api.skinport.com when the
 *     5-min cache is fresh (briefing §9 DON'T #5).
 *   - parse → compact index in USD cents; min_price:null stays null (no $0.00).
 *   - never throws (network error → ok:false, cache untouched).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildSkinportIndex,
  toCents,
  refreshSkinportIndex,
  SKINPORT_TTL_MS,
} from '../../src/modules/oracles/skinport';

/** Minimal chrome.storage.local stub backed by a plain object. */
function installChromeStorage(initial: Record<string, unknown> = {}): {
  store: Record<string, unknown>;
} {
  const store: Record<string, unknown> = { ...initial };
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        },
      },
    },
  };
  return { store };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe('toCents', () => {
  it('converts USD floats to cents; null/invalid → null (never 0)', () => {
    expect(toCents(12.34)).toBe(1234);
    expect(toCents(0.07)).toBe(7);
    expect(toCents(null)).toBeNull();
    expect(toCents(undefined)).toBeNull();
    expect(toCents('12.34')).toBeNull();
    expect(toCents(NaN)).toBeNull();
  });
});

describe('buildSkinportIndex', () => {
  it('indexes by market_hash_name with [min,mean,max] cents', () => {
    const idx = buildSkinportIndex([
      {
        market_hash_name: 'AK-47 | Redline (FT)',
        min_price: 12.34,
        mean_price: 13.1,
        max_price: 20,
      },
      { market_hash_name: 'Glock | Fade', min_price: null, mean_price: 5, max_price: null },
    ]);
    expect(idx['AK-47 | Redline (FT)']).toEqual([1234, 1310, 2000]);
    // min_price null → null (no data), never 0.
    expect(idx['Glock | Fade']).toEqual([null, 500, null]);
  });

  it('skips rows without a name; tolerates non-array', () => {
    expect(buildSkinportIndex([{ min_price: 1 }])).toEqual({});
    expect(buildSkinportIndex(null)).toEqual({});
    expect(buildSkinportIndex('nope')).toEqual({});
  });
});

describe('refreshSkinportIndex — TTL guard', () => {
  beforeEach(() => {
    installChromeStorage({
      skinport_index: {
        fetchedAt: Date.now(), // fresh
        index: { 'AK-47 | Redline (FT)': [1234, 1310, 2000] },
      },
    });
  });

  it('does NOT fetch when the cache is fresh (< 5 min)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const r = await refreshSkinportIndex(false);
    expect(fetchSpy).not.toHaveBeenCalled(); // the §9 DON'T #5 guarantee
    expect(r).toMatchObject({ ok: true, cached: true });
  });

  it('fetches when forced even if fresh', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify([{ market_hash_name: 'X', min_price: 1 }]), { status: 200 }),
      );
    await refreshSkinportIndex(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('refreshSkinportIndex — expired / errors', () => {
  it('fetches when the cache is expired and caches the new index', async () => {
    const { store } = installChromeStorage({
      skinport_index: { fetchedAt: Date.now() - SKINPORT_TTL_MS - 1, index: {} },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            market_hash_name: 'AWP | Asiimov (FT)',
            min_price: 50,
            mean_price: 55,
            max_price: 70,
          },
        ]),
        { status: 200 },
      ),
    );
    const r = await refreshSkinportIndex(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: true, count: 1 });
    const cached = store['skinport_index'] as { index: Record<string, unknown> };
    expect(cached.index['AWP | Asiimov (FT)']).toEqual([5000, 5500, 7000]);
  });

  it('never throws on network error; returns ok:false', async () => {
    installChromeStorage(); // empty → expired
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const r = await refreshSkinportIndex(false);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('network down');
  });

  it('treats a non-OK response as a failure', async () => {
    installChromeStorage();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 429 }));
    const r = await refreshSkinportIndex(false);
    expect(r).toMatchObject({ ok: false, error: 'HTTP 429' });
  });
});
