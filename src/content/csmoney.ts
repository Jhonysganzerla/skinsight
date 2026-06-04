/**
 * CS.Money content script — Rare mode + DB regenerator (v0.3).
 *
 * Pulls /5.0/load_bots_inventory/730 with hasRareStickers=true, renders
 * sticker-breakdown ItemCards keyed off net USD (stickers − weapon). A
 * <details> drawer at the bottom of the overlay exposes the legacy
 * "Regenerate rare_stickers.json" workflow — it downloads a fresh JSON
 * report to the user's Downloads folder. The bundled rare DB is NOT
 * replaced in runtime; Jhony reviews and ships a new version in a
 * subsequent release.
 */
import { createOverlay, type OverlayHandle } from '../modules/shared/overlay';
import {
  readFilterValues,
  renderFilterGrid,
  renderResultsHeader,
  renderScanBar,
  updateScanBar,
  type FilterField,
} from '../modules/shared/ui';
import { buildRareReport, collectCsMoney } from '../modules/rare/csmoney';
import { renderCsMoneyCard } from '../modules/rare/render';
import { wireSteamButtons } from '../modules/oracles/steam-ui';
import { send } from '../modules/shared/messaging';
import { applyStoredLocale, applyStoredProfitParams } from '../modules/shared/settings';
import { esc } from '../modules/shared/fmt';
import { debugLog, isDebug } from '../modules/shared/debug';
import { t } from '../modules/shared/i18n';
import type { CsMoneyItem } from '../modules/rare/types';

const ROOT_ID = 'skinsight-csm-overlay';
const PERSIST_KEY = 'csmoney';

function filters(): FilterField[] {
  return [
    {
      id: 'maxPages',
      label: t('filter.maxPages'),
      type: 'number',
      value: '',
      placeholder: t('filter.ph.all'),
      hint: t('filter.maxPages.hint'),
    },
    { id: 'delayMs', label: t('filter.delayMs'), type: 'number', value: '900' },
    {
      id: 'sort',
      label: t('filter.sort'),
      type: 'select',
      options: [
        { value: 'net_desc', label: t('sort.netDesc') },
        { value: 'stickers_desc', label: t('sort.stickerSum') },
        { value: 'weapon_asc', label: t('sort.weaponAsc') },
        { value: 'count_desc', label: t('sort.countDesc') },
      ],
    },
  ];
}

interface State {
  running: boolean;
  aborted: { aborted: boolean };
  /** Last collected inventory — kept so reactive filters can re-sort +
   *  re-render in place without a fresh network scan. */
  items: CsMoneyItem[];
  /** Pending debounce timer for filter inputs. */
  debounce: ReturnType<typeof setTimeout> | null;
  /** Regenerate (deep DB scan) in flight + its own abort signal. */
  regenerating: boolean;
  regenAborted: { aborted: boolean };
}

const FILTER_DEBOUNCE_MS = 250;

/** Safety cap for any deep scan (regenerate + normal scan). The collector stops
 *  earlier on empty/short page; this only guards a runaway response. The old
 *  user-facing "Pages" cap was removed — the scan now walks to inventory end. */
const SCAN_SAFETY_CAP_PAGES = 250;
const REGEN_MAX_PAGES = SCAN_SAFETY_CAP_PAGES;
const REGEN_DELAY_MS = 900;

let overlay: OverlayHandle | null = null;
const state: State = {
  running: false,
  aborted: { aborted: false },
  items: [],
  debounce: null,
  regenerating: false,
  regenAborted: { aborted: false },
};

function setStatus(text: string, kind?: 'info' | 'ok' | 'err' | ''): void {
  overlay?.setStatus(text, kind);
}

function regenerateBlockHtml(disabled: boolean): string {
  return `
    <details class="sh-hint" style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px;">
      <summary style="cursor:pointer;color:var(--text-muted);user-select:none;">⚙ Rare-DB maintenance</summary>
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
        <p>Downloads a fresh <code>rare_stickers.json</code> report from the current
          CS.Money inventory. The bundled DB is updated only via Skinsight releases —
          this button just produces the file for the maintainer.</p>
        <button class="sh-btn sh-btn-sm sh-btn-ghost" data-role="regen" type="button" ${disabled ? 'disabled' : ''}>
          ${disabled ? 'Collect inventory first' : 'Regenerate rare_stickers.json'}
        </button>
      </div>
    </details>
  `;
}

function bodyHtml(): string {
  return [
    renderFilterGrid(filters()),
    renderScanBar({ info: t('scan.readyHint'), actionLabel: t('scan.scan') }),
    `<div data-role="results"></div>`,
    regenerateBlockHtml(true),
  ].join('');
}

function sortItems(arr: CsMoneyItem[], key: string): CsMoneyItem[] {
  const cmps: Record<string, (a: CsMoneyItem, b: CsMoneyItem) => number> = {
    net_desc: (a, b) => b.netUsd - a.netUsd,
    stickers_desc: (a, b) => b.stickersTotalUsd - a.stickersTotalUsd,
    weapon_asc: (a, b) => a.weaponPriceUsd - b.weaponPriceUsd,
    count_desc: (a, b) => b.stickers.length - a.stickers.length,
  };
  return [...arr].sort(cmps[key] ?? cmps['net_desc']!);
}

/** Re-sort `state.items` by the current Sort filter and (re)render in place.
 *  Called once after a scan and again on every reactive filter change. */
function renderResults(): void {
  if (!overlay) return;
  const list = overlay.body.querySelector<HTMLElement>('[data-role=results]');
  if (!list) return;
  const filters = readFilterValues(overlay.body);
  const sortKey = filters['sort'] ?? 'net_desc';
  const sorted = sortItems(state.items, sortKey);
  list.innerHTML =
    renderResultsHeader(t('results.header.stickers'), t('results.net')) +
    (sorted.length
      ? sorted.map(renderCsMoneyCard).join('')
      : `<div class="sh-empty">
          <div class="sh-empty-icon">⌖</div>
          <div class="sh-empty-title">${t('csm.empty.title')}</div>
          <div class="sh-empty-sub">${t('csm.empty.sub')}</div>
        </div>`);
}

/** Schedule a reactive re-render. `instant` skips the debounce (for selects). */
function scheduleFilterApply(instant: boolean): void {
  if (state.debounce !== null) {
    clearTimeout(state.debounce);
    state.debounce = null;
  }
  if (instant) {
    renderResults();
    return;
  }
  state.debounce = setTimeout(() => {
    state.debounce = null;
    renderResults();
  }, FILTER_DEBOUNCE_MS);
}

async function runScan(): Promise<void> {
  if (!overlay || state.running) return;
  state.running = true;
  state.aborted = { aborted: false };
  // try/catch/finally so a throw mid-scan never leaves the bar stuck on "Stop":
  // the error becomes a localized status and `finally` always resets state.
  try {
    // Opportunistic, TTL-gated remote rare-list refresh (no-op if cache < 24h).
    void send({ type: 'rares:refresh', force: false });
    const filters = readFilterValues(overlay.body);
    const delayMs = Math.max(100, Math.min(5000, parseInt(filters['delayMs'] ?? '900', 10) || 900));
    const sortKey = filters['sort'] ?? 'net_desc';

    // "Max pages" is optional: blank → scan the whole inventory (collector breaks
    // on empty/short page), guarded by SCAN_SAFETY_CAP_PAGES. A positive number
    // caps the scan early, clamped to the safety limit.
    const maxPagesRaw = (filters['maxPages'] ?? '').trim();
    const maxPagesNum = parseInt(maxPagesRaw, 10);
    const maxPages =
      maxPagesRaw && maxPagesNum > 0
        ? Math.min(maxPagesNum, SCAN_SAFETY_CAP_PAGES)
        : SCAN_SAFETY_CAP_PAGES;

    updateScanBar(overlay.body, {
      actionLabel: t('scan.stop'),
      info: t('csm.collecting'),
      progressPct: 0,
    });
    setStatus(t('csm.collectingInv'), 'info');

    const collected = await collectCsMoney({
      maxPages,
      delayMs,
      signal: state.aborted,
      onStatus: (msg) => {
        if (!overlay) return;
        updateScanBar(overlay.body, { info: msg });
      },
    });

    if (state.aborted.aborted) {
      setStatus(t('scan.stopped'), 'info');
      return;
    }

    state.items = collected;

    // Debug-only: dump per-item sticker-overpay for offline formula calibration.
    // No UI change — gated behind localStorage['skinsight:debug'].
    if (isDebug()) dumpOverpaySample(collected);

    if (!overlay) return;
    renderResults();

    // Enable the Regenerate button.
    const drawer = overlay.body.querySelector<HTMLElement>('details');
    if (drawer) drawer.outerHTML = regenerateBlockHtml(false);

    updateScanBar(overlay.body, {
      info: t('csm.complete', {
        n: collected.length,
        p: collected.filter((i) => i.netUsd > 0).length,
      }),
      progressPct: 100,
    });
    setStatus(t('csm.collected', { n: collected.length }), 'ok');

    const top = sortItems(collected, sortKey)[0];
    if (top && top.netUsd > 0) {
      void send({
        type: 'hit:record',
        site: 'csmoney',
        name: top.name,
        sub: `${top.stickers.length} stickers · ${esc(toFixed(top.stickersTotalUsd))}$ in stickers`,
        profitUsd: top.netUsd,
      });
    }
  } catch (e) {
    if (overlay) {
      updateScanBar(overlay.body, { info: t('scan.failed') });
      setStatus(t('scan.error', { msg: (e as Error)?.message ?? String(e) }), 'err');
    }
  } finally {
    finish();
  }
}

function toFixed(n: number): string {
  return n.toFixed(2);
}

/**
 * Debug-only calibration dump (v0.7). For every collected item where CS.Money
 * reports sticker overpay, emit a compact JSON row:
 *   { fullName, price (skin), stickers:[{name, price, overprice}], overpay:{stickers} }
 *
 * Goal: a ~30-50 item sample to fit `overpay ≈ min(r·Σsticker_price, C·skin_price)`
 * (the maintainer derives r and C offline).
 *
 * The pretty JSON is written to localStorage['skinsight:overpay'] — which the
 * content script shares with the page — so it copies from the DEFAULT (page)
 * DevTools console context with no context switching:
 *   copy(localStorage['skinsight:overpay'])
 * It is also stashed on the content-script `window.__skinsightOverpay`.
 */
interface OverpayDumpRow {
  fullName: string;
  price: number;
  stickers: Array<{ name: string; price: number; overprice: number }>;
  overpay: { stickers: number };
}

function dumpOverpaySample(items: CsMoneyItem[]): void {
  const rows: OverpayDumpRow[] = items
    .filter((i) => i.overpayStickers > 0)
    .map((i) => ({
      fullName: i.name,
      price: i.weaponPriceUsd,
      stickers: i.stickers.map((s) => ({
        name: s.name,
        price: s.priceUsd,
        overprice: s.overprice,
      })),
      overpay: { stickers: i.overpayStickers },
    }));
  const json = JSON.stringify(rows, null, 2);
  debugLog(
    `[Skinsight][debug] overpay dump — ${rows.length} item(s) with overpay.stickers > 0 (of ${items.length} collected)`,
  );
  debugLog(json);
  (globalThis as unknown as { __skinsightOverpay?: unknown }).__skinsightOverpay = rows;
  try {
    // Shared with the page → copyable from the default console context.
    localStorage.setItem('skinsight:overpay', json);
  } catch {
    /* quota / disabled storage — the console log above still has the data */
  }
  if (!rows.length && items.length) {
    console.warn(
      '[Skinsight][debug] no items had overpay.stickers > 0 — the field name may differ. ' +
        'Check the "raw CS.Money item/sticker keys" log above and adjust the capture in csmoney.ts.',
    );
  } else {
    debugLog("[Skinsight][debug] copy with: copy(localStorage['skinsight:overpay'])");
  }
}

function regenButton(): HTMLButtonElement | null {
  return overlay?.body.querySelector<HTMLButtonElement>('[data-role=regen]') ?? null;
}

/**
 * Deep-scan CS.Money (hasRareStickers=true) and download a fresh
 * rare_stickers.json. This is a *dedicated* full walk — it does NOT reuse the
 * shallow page set from the normal Scan — with live progress (pages scanned,
 * rare stickers found so far) and elapsed time. The bundled DB is never
 * replaced at runtime; the maintainer commits the downloaded file in a release.
 */
async function regenerate(): Promise<void> {
  if (!overlay || state.regenerating || state.running) return;
  state.regenerating = true;
  state.regenAborted = { aborted: false };
  const t0 = Date.now();
  const elapsed = (): string => ((Date.now() - t0) / 1000).toFixed(0) + 's';

  const btn = regenButton();
  if (btn) btn.textContent = 'Stop regenerate';
  setStatus('Regenerating rare DB — deep-scanning CS.Money…', 'info');

  let pagesSeen = 0;
  const collected = await collectCsMoney({
    maxPages: REGEN_MAX_PAGES,
    delayMs: REGEN_DELAY_MS,
    signal: state.regenAborted,
    onStatus: (msg) => {
      if (!overlay) return;
      if (/^Collecting page/.test(msg)) pagesSeen += 1;
      setStatus(`Scanned ${pagesSeen} pages — ${elapsed()} elapsed. ${msg}`, 'info');
    },
  });

  if (state.regenAborted.aborted) {
    setStatus(`Regenerate stopped after ${pagesSeen} pages (${elapsed()}).`, 'info');
    finishRegen();
    return;
  }

  const report = buildRareReport(collected);
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rare_stickers.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(
    `Downloaded rare_stickers.json — ${pagesSeen} pages, ${report.rare_count} rare stickers (≥ $${report.inferred_threshold_usd.toFixed(2)}) in ${elapsed()}.`,
    'ok',
  );
  finishRegen();
}

function finishRegen(): void {
  state.regenerating = false;
  const btn = regenButton();
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Regenerate rare_stickers.json';
  }
}

function abort(): void {
  state.aborted.aborted = true;
  state.regenAborted.aborted = true;
}

function finish(): void {
  state.running = false;
  if (overlay) updateScanBar(overlay.body, { actionLabel: t('scan.scan') });
}

function mount(): void {
  if (overlay) return;
  overlay = createOverlay({
    rootId: ROOT_ID,
    mode: 'rare',
    modeLabel: 'Rare stickers',
    persistKey: PERSIST_KEY,
    onClose: () => {
      abort();
      overlay?.destroy();
      overlay = null;
    },
  });
  overlay.body.innerHTML = bodyHtml();
  wireSteamButtons(overlay.body);
  setStatus(t('scan.ready'), 'info');

  overlay.body.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-role=scan-action]')) {
      e.preventDefault();
      if (state.running) abort();
      else void runScan();
      return;
    }
    if (t.closest('[data-role=regen]')) {
      e.preventDefault();
      if (state.regenerating) {
        state.regenAborted.aborted = true;
      } else {
        void regenerate();
      }
      return;
    }
  });

  // Reactive filters: re-sort + re-render in place when the user changes a
  // filter after a scan (no rescan). CS.Money is a React SPA, so — like
  // PirateSwap — we listen on `document` in the CAPTURE phase scoped to our
  // overlay: the host framework can swallow bubble-phase change/input events.
  const onFilterEvent = (instant: boolean) => (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (!t || !overlay) return;
    if (!overlay.root.contains(t) || !t.matches?.('[data-filter]')) return;
    if (!state.items.length) return;
    scheduleFilterApply(instant);
  };
  // `<select>` → instant; text/number inputs → debounced.
  document.addEventListener('change', onFilterEvent(true), true);
  document.addEventListener('input', onFilterEvent(false), true);
}

async function bootstrap(): Promise<void> {
  // CS.Money is always-on Rare. The popup's mode toggle only affects
  // SkinsMonkey; a scan running here survives any change there.
  console.debug('[Skinsight] loaded on cs.money');
  await applyStoredLocale();
  await applyStoredProfitParams();
  mount();
}

void bootstrap();
