/**
 * collectCsMoney pagination termination (clamp removal, commit 68f4fd4).
 *
 * The user-facing "Pages" cap is gone; the scan now walks to inventory end. We
 * can't browser-smoke CS.Money (Cloudflare + session), so this proves the
 * termination logic with a mocked fetch: walk to an empty page, stop on a short
 * page, and respect the safety cap when the API never empties.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { collectCsMoney, extractCsMoneyInspectUrl } from '../../src/modules/rare/csmoney';

const LIMIT = 60;

function itemsPage(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: 'I-' + i,
    fullName: 'AK-47 | Redline (FT)',
    price: 1,
    stickers: [{ name: 'Sticker | Foo', price: 1 }],
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- spy used only for mockImplementation/toHaveBeenCalledTimes
let fetchSpy: any;

function installPages(pages: Array<{ items: unknown[]; total?: number }>): void {
  let i = 0;
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    const body = pages[i] ?? { items: [] };
    i += 1;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

beforeEach(() => {
  // Make sleep() between pages resolve instantly.
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void) => {
    cb();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('collectCsMoney — full-inventory termination', () => {
  it('walks full pages until an empty page, then stops', async () => {
    installPages([
      { items: itemsPage(LIMIT) },
      { items: itemsPage(LIMIT) },
      { items: itemsPage(LIMIT) },
      { items: [] }, // empty trailer → stop
    ]);
    const out = await collectCsMoney({ maxPages: 250, delayMs: 100 });
    expect(out).toHaveLength(3 * LIMIT);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it('stops on a short (< LIMIT) page', async () => {
    installPages([{ items: itemsPage(LIMIT) }, { items: itemsPage(10) }]);
    const out = await collectCsMoney({ maxPages: 250, delayMs: 100 });
    expect(out).toHaveLength(LIMIT + 10);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('respects the safety cap when the API never empties', async () => {
    installPages(Array.from({ length: 400 }, () => ({ items: itemsPage(LIMIT) })));
    const out = await collectCsMoney({ maxPages: 250, delayMs: 100 });
    expect(fetchSpy).toHaveBeenCalledTimes(250);
    expect(out).toHaveLength(250 * LIMIT);
  });

  it('stops once the reported total is reached', async () => {
    installPages([
      { items: itemsPage(LIMIT), total: 90 },
      { items: itemsPage(LIMIT), total: 90 }, // 120 ≥ 90 → stop after this page
      { items: itemsPage(LIMIT) },
    ]);
    const out = await collectCsMoney({ maxPages: 250, delayMs: 100 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(2 * LIMIT);
  });
});

describe('extractCsMoneyInspectUrl', () => {
  it('finds a steam:// link regardless of the field name, up to 2 levels deep', () => {
    expect(extractCsMoneyInspectUrl({ inspect: 'steam://run/730//+csgo_econ' })).toBe(
      'steam://run/730//+csgo_econ',
    );
    expect(
      extractCsMoneyInspectUrl({
        asset: { names: { full: 'steam://nested/deep' } },
      } as never),
    ).toBe('steam://nested/deep');
  });

  it('ignores non-steam strings and missing links', () => {
    expect(extractCsMoneyInspectUrl({ img: 'https://cdn.example/x.png' })).toBeNull();
    expect(extractCsMoneyInspectUrl({})).toBeNull();
  });
});
