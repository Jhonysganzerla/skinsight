/**
 * measureRowHeight (v0.7 T1.c) — the self-correcting row-stride measurement
 * that fixes the PirateSwap scroll runaway (88px estimate vs ~2× real cards).
 * Pure logic over `offsetTop`/`offsetHeight`; stubbed children (no layout in
 * node, so the live render path returns 0 and keeps the estimate — covered by
 * the empty/zero cases).
 */
import { describe, it, expect } from 'vitest';
import { measureRowHeight } from '../../src/modules/shared/virtual-list';

function win(cards: Array<{ top: number; h: number }>): HTMLElement {
  const children = cards.map((c) => ({ offsetTop: c.top, offsetHeight: c.h }));
  return { children } as unknown as HTMLElement;
}

describe('measureRowHeight', () => {
  it('returns 0 for an empty window (caller keeps its estimate)', () => {
    expect(measureRowHeight(win([]))).toBe(0);
  });

  it('returns the single card height when only one is mounted', () => {
    expect(measureRowHeight(win([{ top: 0, h: 184 }]))).toBe(184);
  });

  it('returns the median consecutive offsetTop stride (gap-aware)', () => {
    // tops 0,180,360,540 → deltas 180,180,180 → 180 (real stride incl. gap)
    expect(
      measureRowHeight(
        win([
          { top: 0, h: 170 },
          { top: 180, h: 170 },
          { top: 360, h: 170 },
          { top: 540, h: 170 },
        ]),
      ),
    ).toBe(180);
  });

  it('is robust to a single outlier tall card (median, not mean)', () => {
    // tops 0,180,360,800 → deltas 180,180,440 → median 180
    expect(
      measureRowHeight(
        win([
          { top: 0, h: 170 },
          { top: 180, h: 170 },
          { top: 360, h: 170 },
          { top: 800, h: 430 },
        ]),
      ),
    ).toBe(180);
  });

  it('falls back to first card offsetHeight when no positive deltas (no layout)', () => {
    expect(
      measureRowHeight(
        win([
          { top: 0, h: 92 },
          { top: 0, h: 0 },
        ]),
      ),
    ).toBe(92);
  });
});
