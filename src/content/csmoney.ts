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
import { isModeActive, watchSettings } from '../modules/shared/settings';
import { buildRareReport, collectCsMoney } from '../modules/rare/csmoney';
import { renderCsMoneyCard } from '../modules/rare/render';
import { send } from '../modules/shared/messaging';
import { esc } from '../modules/shared/fmt';
import type { CsMoneyItem } from '../modules/rare/types';

const ROOT_ID = 'skinsight-csm-overlay';
const PERSIST_KEY = 'csmoney';

const FILTERS: FilterField[] = [
  { id: 'pages', label: 'Pages', type: 'number', value: '6' },
  { id: 'delayMs', label: 'Delay (ms)', type: 'number', value: '900' },
  {
    id: 'sort',
    label: 'Sort',
    type: 'select',
    options: [
      { value: 'net_desc', label: 'Net $ ↓' },
      { value: 'stickers_desc', label: 'Stickers $ ↓' },
      { value: 'weapon_asc', label: 'Cheapest weapon ↑' },
      { value: 'count_desc', label: 'Sticker count ↓' },
    ],
  },
];

interface State {
  running: boolean;
  aborted: { aborted: boolean };
  items: CsMoneyItem[];
}

let overlay: OverlayHandle | null = null;
const state: State = { running: false, aborted: { aborted: false }, items: [] };

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
    renderFilterGrid(FILTERS),
    renderScanBar({ info: 'Ready. Click Scan to begin.', actionLabel: 'Scan' }),
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

async function runScan(): Promise<void> {
  if (!overlay || state.running) return;
  state.running = true;
  state.aborted = { aborted: false };
  const filters = readFilterValues(overlay.body);
  const pages = Math.max(1, Math.min(50, parseInt(filters['pages'] ?? '6', 10) || 6));
  const delayMs = Math.max(100, Math.min(5000, parseInt(filters['delayMs'] ?? '900', 10) || 900));
  const sortKey = filters['sort'] ?? 'net_desc';

  updateScanBar(overlay.body, { actionLabel: 'Stop', info: 'Collecting…', progressPct: 0 });
  setStatus('Collecting CS.Money inventory…', 'info');

  const collected = await collectCsMoney({
    maxPages: pages,
    delayMs,
    signal: state.aborted,
    onStatus: (msg) => {
      if (!overlay) return;
      updateScanBar(overlay.body, { info: msg });
    },
  });

  if (state.aborted.aborted) {
    setStatus('Scan stopped.', 'info');
    finish();
    return;
  }

  state.items = collected;
  const sorted = sortItems(collected, sortKey);

  if (!overlay) {
    finish();
    return;
  }
  const list = overlay.body.querySelector<HTMLElement>('[data-role=results]');
  if (list) {
    list.innerHTML =
      renderResultsHeader('Item · stickers', 'Net') +
      (sorted.length
        ? sorted.map(renderCsMoneyCard).join('')
        : `<div class="sh-empty">
            <div class="sh-empty-icon">⌖</div>
            <div class="sh-empty-title">No items collected</div>
            <div class="sh-empty-sub">Try increasing pages or check CS.Money rate limit.</div>
          </div>`);
  }

  // Enable the Regenerate button.
  const drawer = overlay.body.querySelector<HTMLElement>('details');
  if (drawer) drawer.outerHTML = regenerateBlockHtml(false);

  updateScanBar(overlay.body, {
    info: `Scan complete — ${collected.length} items, ${collected.filter((i) => i.netUsd > 0).length} profitable.`,
    progressPct: 100,
  });
  setStatus(`Collected ${collected.length} items.`, 'ok');

  const top = sorted[0];
  if (top && top.netUsd > 0) {
    void send({
      type: 'hit:record',
      site: 'csmoney',
      name: top.name,
      sub: `${top.stickers.length} stickers · ${esc(toFixed(top.stickersTotalUsd))}$ in stickers`,
      profitUsd: top.netUsd,
    });
  }
  finish();
}

function toFixed(n: number): string {
  return n.toFixed(2);
}

function regenerate(): void {
  if (!state.items.length) {
    setStatus('Collect first — no items to build report from.', 'err');
    return;
  }
  const report = buildRareReport(state.items);
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
    `Downloaded — threshold $${report.inferred_threshold_usd}, ${report.rare_count} rare candidates.`,
    'ok',
  );
}

function abort(): void {
  state.aborted.aborted = true;
}

function finish(): void {
  state.running = false;
  if (overlay) updateScanBar(overlay.body, { actionLabel: 'Scan' });
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
  setStatus('Ready.', 'info');

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
      regenerate();
      return;
    }
  });
}

function unmount(): void {
  abort();
  overlay?.destroy();
  overlay = null;
}

async function bootstrap(): Promise<void> {
  console.debug('[Skinsight] loaded on cs.money');
  if (await isModeActive('rare')) mount();
  watchSettings((s) => {
    if (s.activeMode === 'rare') mount();
    else unmount();
  });
}

void bootstrap();
