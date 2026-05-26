/**
 * StickerChip rendering — verifies the v0.4 image-or-gradient contract.
 *
 *   imageUrl present → <img> with onerror=display:none (gradient shows on 404)
 *   imageUrl absent  → no <img>; gradient + kind class only
 */
import { describe, it, expect } from 'vitest';
import { renderStickerChip, renderStickerBreakdown } from '../../src/modules/shared/ui';

describe('renderStickerChip', () => {
  it('renders <img> when imageUrl is provided', () => {
    const html = renderStickerChip({
      name: 'kennyS (Foil) | Cologne 2015',
      priceUsd: 58.12,
      kind: 'foil',
      imageUrl: 'https://cdn.example/kennys.png',
    });
    expect(html).toContain('<img src="https://cdn.example/kennys.png"');
    expect(html).toContain(`onerror="this.style.display='none'"`);
    expect(html).toContain('sh-sticker-mini foil');
    expect(html).toContain('$58.12');
  });

  it('omits <img> when imageUrl is null', () => {
    const html = renderStickerChip({
      name: 'Plain Sticker',
      priceUsd: 5,
      kind: 'matte',
      imageUrl: null,
    });
    expect(html).not.toContain('<img');
    // matte → no extra class on the gradient div
    expect(html).toMatch(/class="sh-sticker-mini">/);
  });

  it('respects each kind variant (matte/foil/holo)', () => {
    const matte = renderStickerChip({ name: 'a', kind: 'matte', imageUrl: null });
    const foil = renderStickerChip({ name: 'b', kind: 'foil', imageUrl: null });
    const holo = renderStickerChip({ name: 'c', kind: 'holo', imageUrl: null });
    expect(matte).toMatch(/class="sh-sticker-mini">/);
    expect(foil).toContain('sh-sticker-mini foil');
    expect(holo).toContain('sh-sticker-mini holo');
  });

  it('escapes sticker names', () => {
    const html = renderStickerChip({
      name: '<script>alert(1)</script>',
      imageUrl: null,
    });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('renderStickerBreakdown returns empty string for no chips', () => {
    expect(renderStickerBreakdown([])).toBe('');
  });

  it('renderStickerBreakdown wraps chips in sh-sticker-breakdown', () => {
    const out = renderStickerBreakdown([
      { name: 'A', imageUrl: null },
      { name: 'B', imageUrl: null },
    ]);
    expect(out).toContain('class="sh-sticker-breakdown"');
    expect((out.match(/sh-sticker-mini/g) ?? []).length).toBe(2);
  });
});
