/** Format US cents (integer) as $X.XX. */
export function fmtCents(cents: number | null | undefined): string {
  if (cents == null || !isFinite(cents)) return '—';
  return '$' + (cents / 100).toFixed(2);
}

/** Format USD dollars (float) as $X.XX. */
export function fmtUsd(usd: number | null | undefined): string {
  if (usd == null || !isFinite(usd)) return '—';
  return (
    '$' +
    Number(usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

/** Format ROI as percentage (0.31 -> "31%"). */
export function fmtPct(n: number): string {
  if (!isFinite(n)) return '—';
  return Math.round(n * 100) + '%';
}

/** Escape HTML for safe insertion into innerHTML. */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Validate URL is http/https before opening — prevent javascript: injection. */
export function safeUrl(u: unknown): string {
  try {
    const p = new URL(String(u ?? ''));
    if (p.protocol === 'https:' || p.protocol === 'http:') return p.href;
  } catch {
    /* ignore */
  }
  return 'about:blank';
}

/** Sleep helper. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Wear abbreviation from an exterior string or a full market_hash_name.
 * 'Field-Tested' / "AK-47 | Redline (Field-Tested)" → 'FT'. '' when none.
 */
export function wearCode(s: string): string {
  const x = String(s || '');
  if (/Factory New/i.test(x)) return 'FN';
  if (/Minimal Wear/i.test(x)) return 'MW';
  if (/Field-Tested/i.test(x)) return 'FT';
  if (/Well-Worn/i.test(x)) return 'WW';
  if (/Battle-Scarred/i.test(x)) return 'BS';
  return '';
}

/** Strip "(Factory New)" etc. from market hash names for compact display. */
export function shortExterior(name: string): string {
  return String(name || '')
    .replace(' (Factory New)', '')
    .replace(' (Minimal Wear)', '')
    .replace(' (Field-Tested)', '')
    .replace(' (Well-Worn)', '')
    .replace(' (Battle-Scarred)', '');
}

/** "Sticker | Foo" -> "Foo". */
export function stripStickerPrefix(name: string): string {
  return String(name || '').replace(/^Sticker \| /, '');
}

/** "Charm | Foo" -> "Foo". */
export function stripCharmPrefix(name: string): string {
  return String(name || '').replace(/^Charm \| /, '');
}
