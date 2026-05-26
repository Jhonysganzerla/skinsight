/**
 * Sliding-window TTL + GC for the popup's "Today's hits" feed.
 * The pure `filterHits` is testable without faking chrome.storage.
 */
import { describe, it, expect } from 'vitest';
import {
  filterHits,
  HITS_MAX_ENTRIES,
  HITS_TTL_MS,
  type TodayHit,
} from '../../src/modules/shared/storage';

function mkHit(tsOffsetMs: number, name = 'hit'): TodayHit {
  return {
    ts: Date.now() + tsOffsetMs,
    site: 'skinsmonkey',
    name,
    sub: '—',
    profitUsd: 1.0,
  };
}

describe('storage/hits — sliding 24h TTL', () => {
  it('keeps entries within 24h, drops older', () => {
    const now = 1_700_000_000_000;
    const hits: TodayHit[] = [
      { ts: now - 25 * 3600_000, site: 's', name: 'too old', sub: '', profitUsd: 1 },
      { ts: now - 23 * 3600_000, site: 's', name: 'barely in', sub: '', profitUsd: 1 },
      { ts: now, site: 's', name: 'now', sub: '', profitUsd: 1 },
    ];
    const out = filterHits(hits, now);
    expect(out.map((h) => h.name)).toEqual(['barely in', 'now']);
  });

  it('caps to HITS_MAX_ENTRIES (30)', () => {
    const now = Date.now();
    const hits = Array.from({ length: 50 }, (_, i) => mkHit(-i * 1000, `h${i}`));
    const out = filterHits(hits, now);
    expect(out).toHaveLength(HITS_MAX_ENTRIES);
    expect(out[0]?.name).toBe('h0');
    expect(out[29]?.name).toBe('h29');
  });

  it('drops entries with missing/invalid ts', () => {
    const now = Date.now();
    const hits = [
      { ts: now, site: 's', name: 'ok', sub: '', profitUsd: 1 },
      { ts: undefined as unknown as number, site: 's', name: 'no ts', sub: '', profitUsd: 1 },
      { ts: 'oops' as unknown as number, site: 's', name: 'bad ts', sub: '', profitUsd: 1 },
    ];
    const out = filterHits(hits, now);
    expect(out.map((h) => h.name)).toEqual(['ok']);
  });

  it('TTL constant matches the 24h contract', () => {
    expect(HITS_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
