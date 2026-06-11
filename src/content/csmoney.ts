/**
 * CS.Money content script — Rare mode + DB regenerator (v0.3).
 *
 * Pulls /5.0/load_bots_inventory/730 with hasRareStickers=true, renders
 * sticker-breakdown ItemCards keyed off net USD (stickers − weapon). A
 * <details> drawer at the bottom of the overlay exposes the legacy
 * "Regenerate rare_stickers.json" workflow — it downloads a fresh JSON
 * report to the user's Downloads folder. The bundled rare DB is NOT
 * replaced in runtime; the maintainer reviews and ships a new version in a
 * subsequent release.
 *
 * Shared Rare plumbing (state, pattern query, mode tag, debounce, filter
 * listeners) lives in modules/rare/scan-controller.ts.
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
import { createRareController } from '../modules/rare/scan-controller';
import { wireSteamButtons } from '../modules/oracles/steam-ui';
import { send } from '../modules/shared/messaging';
import {
  applyStoredLocale,
  applyStoredProfitParams,
  getRareSubmode,
  watchSettings,
} from '../modules/shared/settings';
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

/** Safety cap for any deep scan (regenerate + normal scan). The collector stops
 *  earlier on empty/short page; this only guards a runaway response. The old
 *  user-facing "Pages" cap was removed — the scan now walks to inventory end. */
const SCAN_SAFETY_CAP_PAGES = 250;
const REGEN_MAX_PAGES = SCAN_SAFETY_CAP_PAGES;
const REGEN_DELAY_MS = 900;

let overlay: OverlayHandle | null = null;
/** Last collected inventory — kept so reactive filters can re-sort +
 *  re-render in place without a fresh network scan. */
let items: CsMoneyItem[] = [];
/** Regenerate (deep DB scan) in flight + its own abort signal. */
let regenerating = false;
let regenAborted: { aborted: boolean } = { aborted: false };

function setStatus(text: string, kind?: 'info' | 'ok' | 'err' | ''): void {
  overlay?.setStatus(text, kind);
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

const ctl = createRareController({
  site: 'csmoney',
  getOverlay: () => overlay,
  hasResults: () => items.length > 0,
  renderStickerResults: (list) => {
    if (!overlay) return;
    const filterVals = readFilterValues(overlay.body);
    const sortKey = filterVals['sort'] ?? 'net_desc';
    const sorted = sortItems(items, sortKey);
    list.innerHTML =
      renderResultsHeader(t('results.header.stickers'), t('results.net')) +
      (sorted.length
        ? sorted.map(renderCsMoneyCard).join('')
        : `<div class="sh-empty">
            <div class="sh-empty-icon">⌖</div>
            <div class="sh-empty-title">${t('csm.empty.title')}</div>
            <div class="sh-empty-sub">${t('csm.empty.sub')}</div>
          </div>`);
  },
});

function regenerateBlockHtml(disabled: boolean): string {
  return `
    <details class="sh-hint" style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px;">
      <summary style="cursor:pointer;color:var(--text-muted);user-select:none;">${esc(t('regen.title'))}</summary>
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
        <p>${esc(t('regen.desc'))}</p>
        <button class="sh-btn sh-btn-sm sh-btn-ghost" data-role="regen" type="button" ${disabled ? 'disabled' : ''}>
          ${esc(disabled ? t('regen.collectFirst') : t('regen.button'))}
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

async function runScan(): Promise<void> {
  if (!ctl.beginScan()) return;
  if (!overlay) return;
  // try/catch/finally so a throw mid-scan never leaves the bar stuck on "Stop":
  // the error becomes a localized status and `finally` always resets state.
  try {
    ctl.state.submode = await getRareSubmode();
    ctl.setModeTagFor(ctl.state.submode);
    if (ctl.state.submode === 'pattern') {
      // Targeted query-by-name path (v0.9.1) — no full-inventory walk.
      await ctl.runPatternQuery();
      return;
    }
    // Opportunistic, TTL-gated remote rare-list refresh (no-op if cache < 24h).
    void send({ type: 'rares:refresh', force: false });
    const filterVals = readFilterValues(overlay.body);
    const delayMs = Math.max(
      100,
      Math.min(5000, parseInt(filterVals['delayMs'] ?? '900', 10) || 900),
    );
    const sortKey = filterVals['sort'] ?? 'net_desc';

    // "Max pages" is optional: blank → scan the whole inventory (collector breaks
    // on empty/short page), guarded by SCAN_SAFETY_CAP_PAGES. A positive number
    // caps the scan early, clamped to the safety limit.
    const maxPagesRaw = (filterVals['maxPages'] ?? '').trim();
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

    let schemaWarn: string | null = null;
    const collected = await collectCsMoney({
      maxPages,
      delayMs,
      signal: ctl.state.aborted,
      onStatus: (msg) => {
        if (!overlay) return;
        updateScanBar(overlay.body, { info: msg });
      },
      onWarn: (msg) => {
        schemaWarn = msg;
      },
    });

    if (ctl.state.aborted.aborted) {
      setStatus(t('scan.stopped'), 'info');
      return;
    }

    items = collected;

    // Debug-only: dump per-item sticker-overpay for offline formula calibration.
    // No UI change — gated behind localStorage['skinsight:debug'].
    if (isDebug()) dumpOverpaySample(collected);

    if (!overlay) return;
    ctl.renderResults();

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
    // Schema warning + empty scan = likely API change, not an empty inventory.
    if (schemaWarn && collected.length === 0) setStatus(schemaWarn, 'err');
    else setStatus(t('csm.collected', { n: collected.length }), 'ok');

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
    ctl.finish();
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

function dumpOverpaySample(collected: CsMoneyItem[]): void {
  const rows: OverpayDumpRow[] = collected
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
    `[Skinsight][debug] overpay dump — ${rows.length} item(s) with overpay.stickers > 0 (of ${collected.length} collected)`,
  );
  debugLog(json);
  (globalThis as unknown as { __skinsightOverpay?: unknown }).__skinsightOverpay = rows;
  try {
    // Shared with the page → copyable from the default console context.
    localStorage.setItem('skinsight:overpay', json);
  } catch {
    /* quota / disabled storage — the console log above still has the data */
  }
  if (!rows.length && collected.length) {
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
  if (!overlay || regenerating || ctl.state.running) return;
  regenerating = true;
  regenAborted = { aborted: false };
  const t0 = Date.now();
  const elapsed = (): string => ((Date.now() - t0) / 1000).toFixed(0) + 's';

  const btn = regenButton();
  if (btn) btn.textContent = t('regen.stop');
  setStatus(t('regen.running'), 'info');

  let pagesSeen = 0;
  const collected = await collectCsMoney({
    maxPages: REGEN_MAX_PAGES,
    delayMs: REGEN_DELAY_MS,
    signal: regenAborted,
    // Structured page counter — no regex over the (localized) status text.
    onPage: () => {
      pagesSeen += 1;
    },
    onStatus: (msg) => {
      if (!overlay) return;
      setStatus(t('regen.progress', { p: pagesSeen, t: elapsed(), msg }), 'info');
    },
  });

  if (regenAborted.aborted) {
    setStatus(t('regen.stopped', { p: pagesSeen, t: elapsed() }), 'info');
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
    t('regen.done', {
      p: pagesSeen,
      n: report.rare_count,
      thr: report.inferred_threshold_usd.toFixed(2),
      t: elapsed(),
    }),
    'ok',
  );
  finishRegen();
}

function finishRegen(): void {
  regenerating = false;
  const btn = regenButton();
  if (btn) {
    btn.disabled = false;
    btn.textContent = t('regen.button');
  }
}

function abortAll(): void {
  ctl.abort();
  regenAborted.aborted = true;
}

function mount(): void {
  if (overlay) return;
  overlay = createOverlay({
    rootId: ROOT_ID,
    mode: 'rare',
    modeLabel: 'Rare stickers',
    persistKey: PERSIST_KEY,
    // Close now hides (the shell minimizes itself); we only abort the scan.
    onClose: abortAll,
  });
  overlay.body.innerHTML = bodyHtml();
  wireSteamButtons(overlay.body);
  setStatus(t('scan.ready'), 'info');

  overlay.body.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-role=scan-action]')) {
      e.preventDefault();
      if (ctl.state.running) ctl.abort();
      else void runScan();
      return;
    }
    if (target.closest('[data-role=regen]')) {
      e.preventDefault();
      if (regenerating) {
        regenAborted.aborted = true;
      } else {
        void regenerate();
      }
      return;
    }
  });

  // Reactive filters: re-sort + re-render in place when the user changes a
  // filter after a scan (no rescan). Capture-phase document listeners — see
  // scan-controller.ts.
  ctl.registerFilterListeners();
}

async function bootstrap(): Promise<void> {
  // CS.Money is always-on Rare. The popup's mode toggle only affects
  // SkinsMonkey; a scan running here survives any change there.
  console.debug('[Skinsight] loaded on cs.money');
  await applyStoredLocale();
  await applyStoredProfitParams();
  mount();
  void ctl.refreshModeTag();
  // Live-update the header tag when the popup flips the Rare sub-mode.
  watchSettings(() => void ctl.refreshModeTag());
}

void bootstrap();
