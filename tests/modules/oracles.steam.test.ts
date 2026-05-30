/**
 * Steam Market oracle (v0.5) — cache, parse, rate-limit guard, 429 handling.
 *
 * The module keeps singletons (token bucket, mirror, 429 counter), so each test
 * re-imports a fresh copy via vi.resetModules(). chrome.storage.local + fetch
 * are stubbed; no real Chrome runtime / network.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type Bag = Record<string, unknown>;
let bag: Bag;

const stubChrome = {
  storage: {
    local: {
      async get(key: string): Promise<Bag> {
        return key in bag ? { [key]: bag[key] } : {};
      },
      async set(items: Bag): Promise<void> {
        Object.assign(bag, items);
      },
      async remove(key: string): Promise<void> {
        delete bag[key];
      },
    },
  },
};

function priceResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  bag = {};
  vi.resetModules();
  (globalThis as unknown as { chrome: typeof stubChrome }).chrome = stubChrome;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function load() {
  return import('../../src/modules/oracles/steam');
}

describe('oracles/steam — parse', () => {
  it('parses lowest + median + volume into USD cents', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        priceResponse({ success: true, lowest_price: '$1.50', median_price: '$2.00', volume: '1,234' }),
      );
    const { getSteamPrice } = await load();
    const p = await getSteamPrice('AK-47 | Redline (FT)');
    expect(p).toEqual({
      lowestCents: 150,
      medianCents: 200,
      volume: 1234,
      currency: 'USD',
      fetchedAt: expect.any(Number),
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('currency=1');
  });

  it('tolerates missing fields (null, not crash)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(priceResponse({ success: true, volume: '5' }));
    const { getSteamPrice } = await load();
    const p = await getSteamPrice('X');
    expect(p?.lowestCents).toBeNull();
    expect(p?.medianCents).toBeNull();
    expect(p?.volume).toBe(5);
  });
});

describe('oracles/steam — cache (TTL 1h)', () => {
  it('does not re-fetch within the TTL', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(priceResponse({ success: true, lowest_price: '$3.00' }));
    const { getSteamPrice, getSteamPriceCached } = await load();
    await getSteamPrice('Glock | Fade');
    await getSteamPrice('Glock | Fade'); // served from cache
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Sync mirror read (the Arbitrage contract) is warm after the fetch.
    expect(getSteamPriceCached('Glock | Fade')?.lowestCents).toBe(300);
  });
});

describe('oracles/steam — 429 backoff', () => {
  it('returns null on HTTP 429 (and does not throw)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(priceResponse({}, 429));
    const { getSteamPrice } = await load();
    await expect(getSteamPrice('Throttled')).resolves.toBeNull();
  });
});

describe('oracles/steam — rate-limit guard (15/min)', () => {
  it('serves 15 immediately, then queues the 16th until a token refills', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(priceResponse({ success: true, lowest_price: '$1.00' }));
    const { getSteamPrice } = await load();

    // Fire 16 distinct names (distinct → no cache short-circuit).
    const calls = Array.from({ length: 16 }, (_, i) => getSteamPrice('item-' + i));
    await vi.advanceTimersByTimeAsync(0); // flush microtasks: 15 tokens consumed

    expect(fetchSpy).toHaveBeenCalledTimes(15);

    // Refill is 15/60000ms = 1 token / 4000ms. Advance past one refill.
    await vi.advanceTimersByTimeAsync(4100);
    expect(fetchSpy).toHaveBeenCalledTimes(16);

    await Promise.all(calls);
  });
});
