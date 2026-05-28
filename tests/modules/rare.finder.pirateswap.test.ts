/**
 * PirateSwap full-inventory scan (v0.4.1 Issue 2).
 *
 * Drops the `Max pages` cap that v0.4 exposed and walks the inventory
 * until PS reports `empty=true` or the SAFETY cap fires.
 *
 * The legacy v0.3/v0.4 behavior was: `Math.min(opts.maxPages || 2000, 2000)`
 * + break on `page.length < results`. v0.4.1 trusts `empty:true` from the
 * server, and ignores `totalResults` / `totalPages` (PS reports 0 for those
 * in our captures — captured in finder.ts comments).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PS_SAFETY_CAP_PAGES, collectAll } from '../../src/modules/rare/finder';

interface FakePage {
  items: Array<{ id: string; marketHashName: string; price: number; stickers: [] }>;
  empty?: boolean;
  totalResults?: number;
  totalPages?: number;
}

function pageOf(n: number, startId = 0): FakePage {
  const items = Array.from({ length: n }, (_, i) => ({
    id: `PS-${startId + i}`,
    marketHashName: 'Item',
    price: 1,
    stickers: [] as [],
  }));
  return { items };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vitest MockInstance generics don't line up with fetch overloads; the spy is only used for `mockImplementation`/`toHaveBeenCalledTimes` so the cast is benign.
let fetchSpy: any;

beforeEach(() => {
  // Use real timers so the inter-page sleep() resolves without
  // vi.advanceTimers gymnastics. Each PS page sleeps 250ms; for tests we
  // patch sleep via spying on setTimeout to resolve immediately.
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void) => {
    cb();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function installFetchSequence(responses: FakePage[]): void {
  let i = 0;
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    const body = responses[i] ?? { items: [], empty: true };
    i += 1;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

describe('collectAll PirateSwap — full-inventory scan', () => {
  it('walks every page until empty=true (small inventory)', async () => {
    // 4 pages of items, the 5th is the empty trailer.
    installFetchSequence([
      pageOf(40, 0),
      pageOf(40, 40),
      pageOf(40, 80),
      pageOf(40, 120),
      { items: [], empty: true },
    ]);
    const items = await collectAll({ site: 'pirateswap' });
    expect(items).toHaveLength(160);
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });

  it('treats `empty:true` on a page that still has items as the last batch', async () => {
    // PS sometimes flags empty=true while returning a final partial batch.
    installFetchSequence([
      pageOf(40, 0),
      { items: [{ id: 'tail', marketHashName: '', price: 0, stickers: [] }] as never, empty: true },
    ]);
    const items = await collectAll({ site: 'pirateswap' });
    expect(items).toHaveLength(41);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('stops at SAFETY cap (250 pages) when the API never sets empty=true', async () => {
    // Always-40-items mock — would loop forever without the cap.
    installFetchSequence(Array.from({ length: 400 }, () => pageOf(40)));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const items = await collectAll({ site: 'pirateswap' });
    expect(fetchSpy).toHaveBeenCalledTimes(PS_SAFETY_CAP_PAGES);
    expect(items).toHaveLength(PS_SAFETY_CAP_PAGES * 40);
    warn.mockRestore();
  });

  it('honors abort signal mid-scan', async () => {
    installFetchSequence(Array.from({ length: 50 }, () => pageOf(40)));
    const signal = { aborted: false };
    let i = 0;
    fetchSpy.mockImplementation(async () => {
      i += 1;
      if (i === 5) signal.aborted = true;
      return new Response(JSON.stringify(pageOf(40)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const items = await collectAll({ site: 'pirateswap', signal });
    expect(items.length).toBeLessThanOrEqual(40 * 5);
    expect(items.length).toBeGreaterThanOrEqual(40 * 4);
  });

  it('builds the request URL without the no-op itemWithSticker param (v0.4.1 T3)', async () => {
    installFetchSequence([pageOf(40, 0), { items: [], empty: true }]);
    await collectAll({ site: 'pirateswap' });
    const firstUrl = String(fetchSpy.mock.calls[0]?.[0] ?? '');
    expect(firstUrl).toContain('/inventory/v2/ExchangerInventory');
    expect(firstUrl).toContain('isSouvenir=false');
    expect(firstUrl).not.toContain('itemWithSticker');
  });

  it('breaks on transient fetch error without losing earlier pages', async () => {
    let i = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      i += 1;
      if (i === 3) throw new Error('network kaboom');
      return new Response(JSON.stringify(pageOf(40)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const items = await collectAll({ site: 'pirateswap' });
    // Pages 1+2 succeeded → 80 items kept; page 3 threw, loop broke.
    expect(items).toHaveLength(80);
  });
});
