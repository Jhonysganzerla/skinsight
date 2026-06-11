/**
 * Scan memory (v0.10): seen-set diffing (flagNew), snapshots and GC.
 * Exercised against a tiny in-memory chrome.storage.local stub.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  agoLabel,
  flagNew,
  loadSnapshot,
  resultKey,
  runScanMemoryGc,
  saveSnapshot,
  SNAP_TTL_MS,
} from '../../src/modules/shared/scan-memory';

type StorageBag = Record<string, unknown>;
let bag: StorageBag = {};

const stubChrome = {
  storage: {
    local: {
      async get(key: string | null): Promise<StorageBag> {
        if (key === null) return { ...bag };
        return key in bag ? { [key]: bag[key] } : {};
      },
      async set(items: StorageBag): Promise<void> {
        Object.assign(bag, items);
      },
      async remove(keys: string | string[]): Promise<void> {
        for (const k of Array.isArray(keys) ? keys : [keys]) delete bag[k];
      },
    },
  },
};

beforeEach(() => {
  bag = {};
  (globalThis as unknown as { chrome: typeof stubChrome }).chrome = stubChrome;
});

interface FakeItem {
  id?: string;
  name?: string;
  marketHashName?: string;
  paintSeed?: number | null;
  isNew?: boolean;
}

const item = (id: string): FakeItem => ({ id, name: id });

describe('resultKey', () => {
  it('prefers the asset id', () => {
    expect(resultKey({ id: 'abc', name: 'x', paintSeed: 1 })).toBe('id:abc');
  });
  it('falls back to name#seed (pattern-query dedupe shape)', () => {
    expect(resultKey({ marketHashName: 'AWP | PAW', paintSeed: 41 })).toBe('nm:AWP | PAW#41');
  });
});

describe('flagNew', () => {
  it('first scan is a silent baseline — nothing flagged, set seeded', async () => {
    const items = [item('a'), item('b')];
    const n = await flagNew('test:sticker', items, resultKey);
    expect(n).toBe(0);
    expect(items.every((i) => !i.isNew)).toBe(true);
    // Second scan: one repeat, one fresh → only the fresh one flagged.
    const next = [item('a'), item('c')];
    const n2 = await flagNew('test:sticker', next, resultKey);
    expect(n2).toBe(1);
    expect(next[0]?.isNew).toBe(false);
    expect(next[1]?.isNew).toBe(true);
  });

  it('scopes are independent', async () => {
    await flagNew('site1:sticker', [item('a')], resultKey);
    const other = [item('a')];
    await flagNew('site2:sticker', other, resultKey);
    expect(other[0]?.isNew).toBe(false); // baseline for site2, not "new"
    const again = [item('a'), item('b')];
    const n = await flagNew('site2:sticker', again, resultKey);
    expect(n).toBe(1);
    expect(again[1]?.isNew).toBe(true);
  });

  it('never throws when storage is unavailable', async () => {
    (globalThis as unknown as { chrome: unknown }).chrome = undefined;
    await expect(flagNew('x', [item('a')], resultKey)).resolves.toBe(0);
  });
});

describe('snapshots', () => {
  it('round-trips the last scan', async () => {
    await saveSnapshot('test:sticker', [item('a'), item('b')]);
    const snap = await loadSnapshot<FakeItem>('test:sticker');
    expect(snap?.results).toHaveLength(2);
    expect(snap?.truncated).toBe(false);
  });

  it('caps oversized result sets and marks them truncated', async () => {
    const big = Array.from({ length: 600 }, (_, i) => item(`i${i}`));
    await saveSnapshot('test:sticker', big);
    const snap = await loadSnapshot<FakeItem>('test:sticker');
    expect(snap?.results).toHaveLength(500);
    expect(snap?.truncated).toBe(true);
  });

  it('expires after SNAP_TTL_MS', async () => {
    await saveSnapshot('test:sticker', [item('a')]);
    (bag['last_scan:test:sticker'] as { ts: number }).ts = Date.now() - SNAP_TTL_MS - 1;
    expect(await loadSnapshot('test:sticker')).toBeNull();
  });

  it('GC removes expired snapshots and leaves fresh ones + seen sets', async () => {
    await saveSnapshot('old:sticker', [item('a')]);
    await saveSnapshot('new:sticker', [item('b')]);
    await flagNew('keep:sticker', [item('c')], resultKey);
    (bag['last_scan:old:sticker'] as { ts: number }).ts = Date.now() - SNAP_TTL_MS - 1;
    const removed = await runScanMemoryGc();
    expect(removed).toBe(1);
    expect(bag['last_scan:old:sticker']).toBeUndefined();
    expect(bag['last_scan:new:sticker']).toBeDefined();
    expect(bag['seen:keep:sticker']).toBeDefined();
  });
});

describe('agoLabel', () => {
  it('formats minutes then hours', () => {
    const now = 1_700_000_000_000;
    expect(agoLabel(now - 5 * 60_000, now)).toBe('5 min');
    expect(agoLabel(now - 3 * 3600_000, now)).toBe('3 h');
    expect(agoLabel(now - 10_000, now)).toBe('1 min'); // floor at 1 min
  });
});
