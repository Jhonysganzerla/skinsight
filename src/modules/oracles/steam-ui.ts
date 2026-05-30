/**
 * Steam price button wiring (v0.5 T3) — content-script side.
 *
 * Cards render a `[data-role=steam-cell]` via `renderSteamCell`. This attaches
 * ONE delegated click listener to the overlay body, so it survives virtual-list
 * re-mounts (the listener is on a stable ancestor, not per-card). On click it
 * asks the SW for the price, primes the oracle mirror, and re-renders just that
 * cell from the mirror — the loaded value never lives in the DOM, so a card
 * that scrolls out and back re-derives its price from `getSteamPriceCached`.
 */
import { send } from '../shared/messaging';
import { renderSteamCell, steamCellLoadingHtml } from '../shared/ui';
import { getSteamPriceCached, primeSteamMirror, type SteamPrice } from './steam';

const QUOTA_WARN_AT = 12; // show the "Steam slow" hint at ≥12/15 used.

/** Wire the delegated Steam-price click handler + quota indicator onto `root`. */
export function wireSteamButtons(root: HTMLElement): void {
  if ((root as { _steamWired?: boolean })._steamWired) return; // idempotent
  (root as { _steamWired?: boolean })._steamWired = true;

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    const btn = target?.closest?.('[data-role=steam-price]');
    if (!btn) return;
    const cell = btn.closest<HTMLElement>('[data-role=steam-cell]');
    const mhn = cell?.dataset['mhn'];
    if (!cell || !mhn) return;
    e.preventDefault();
    void loadPrice(root, cell, mhn);
  });
}

async function loadPrice(root: HTMLElement, cell: HTMLElement, mhn: string): Promise<void> {
  // Already cached (e.g. fetched on another card / earlier) → render straight.
  const cached = getSteamPriceCached(mhn);
  if (cached) {
    cell.outerHTML = renderSteamCell(mhn, cached);
    return;
  }
  cell.innerHTML = steamCellLoadingHtml();
  const r = await send({ type: 'steam:price', marketHashName: mhn });
  const price = (r.data as SteamPrice | null) ?? null;
  primeSteamMirror(mhn, price);
  // The cell may have been replaced by a re-render mid-flight; re-find by mhn.
  const live =
    root.querySelector<HTMLElement>(`[data-role=steam-cell][data-mhn="${cssEscape(mhn)}"]`) ?? cell;
  live.outerHTML = renderSteamCell(mhn, price);
  void refreshQuota(root);
}

/** Poll the SW for token-bucket usage and surface a hint when near the cap. */
export async function refreshQuota(root: HTMLElement): Promise<void> {
  const r = await send({ type: 'steam:quota' });
  const q = r.data as { used: number; max: number; windowMs: number } | undefined;
  if (!q) return;
  const el = ensureQuotaEl(root);
  if (q.used >= QUOTA_WARN_AT) {
    el.textContent = `Steam slow — ${q.used}/${q.max} used`;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

function ensureQuotaEl(root: HTMLElement): HTMLElement {
  let el = root.querySelector<HTMLElement>('[data-role=steam-quota]');
  if (!el) {
    el = root.ownerDocument.createElement('div');
    el.setAttribute('data-role', 'steam-quota');
    el.className = 'sh-meta-chip sh-pill-mini sh-pill-warn';
    el.hidden = true;
    root.insertBefore(el, root.firstChild);
  }
  return el;
}

/** Minimal CSS.escape fallback (attribute-selector safety for the mhn value). */
function cssEscape(s: string): string {
  const g = globalThis as { CSS?: { escape?: (v: string) => string } };
  if (g.CSS?.escape) return g.CSS.escape(s);
  return s.replace(/["\\\]]/g, '\\$&');
}
