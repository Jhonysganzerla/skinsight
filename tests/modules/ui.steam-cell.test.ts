/**
 * renderSteamCell (v0.5 T3) — pure HTML contract. The cell always re-derives
 * from the (cached) price, so it survives virtual-list re-mounts; here we just
 * assert the three render states. No DOM needed.
 */
import { describe, it, expect } from 'vitest';
import { renderSteamCell } from '../../src/modules/shared/ui';

describe('renderSteamCell', () => {
  it('renders an idle button when no price is cached', () => {
    const html = renderSteamCell('AK-47 | Redline (FT)', null);
    expect(html).toContain('data-role="steam-cell"');
    expect(html).toContain('data-mhn="AK-47 | Redline (FT)"');
    expect(html).toContain('data-role="steam-price"');
    expect(html).toContain('Steam price');
  });

  it('shows lowest as the primary number, labelled USD, with median+volume in the tooltip', () => {
    const html = renderSteamCell('Glock | Fade', {
      lowestCents: 1234,
      medianCents: 1310,
      volume: 42,
    });
    expect(html).toContain('Steam $12.34 USD'); // lowest is primary
    expect(html).toContain('title="med $13.10 · vol 42"');
    expect(html).not.toContain('data-role="steam-price"'); // no button once loaded
  });

  it('falls back to median when lowest is null', () => {
    const html = renderSteamCell('X', { lowestCents: null, medianCents: 900, volume: null });
    expect(html).toContain('Steam $9.00 USD');
  });

  it('shows a "no data" chip when both prices are null', () => {
    const html = renderSteamCell('Y', { lowestCents: null, medianCents: null, volume: null });
    expect(html).toContain('no data');
    expect(html).not.toContain('data-role="steam-price"');
  });

  it('escapes the market_hash_name in the data attribute', () => {
    const html = renderSteamCell('A "B" <c>', null);
    expect(html).toContain('data-mhn="A &quot;B&quot; &lt;c&gt;"');
  });
});
