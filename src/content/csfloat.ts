/**
 * CSFloat content script — Arbitrage oracle (v0.2).
 *
 * Listens for `arbitrage:payload` from the service worker, runs the
 * `analyzer.runAnalysis` loop (same-origin CSFloat API), and renders the
 * scored list in the overlay. Reports completion via `arbitrage:result`.
 */
import { createOverlay, type OverlayHandle } from '../modules/shared/overlay';
import {
  renderItemCard,
  renderResultsHeader,
  renderScanBar,
  updateScanBar,
  variantByProfitPct,
  type ItemCardProps,
  type MetaChip,
} from '../modules/shared/ui';
import {
  hitRowFromAnalysisRow,
  onMessage,
  send,
  type Message,
  type MessageResponse,
} from '../modules/shared/messaging';
import { runAnalysis } from '../modules/arbitrage/analyzer';
import { buildCsfUrl } from '../modules/arbitrage/csf-url';
import type { AnalysisRow, ArbitrageItem, ExportPayload } from '../modules/arbitrage/types';
import { shortExterior } from '../modules/shared/fmt';

const ROOT_ID = 'skinsight-csf-overlay';
const PERSIST_KEY = 'csfloat';

let overlay: OverlayHandle | null = null;
let aborted = false;

function setStatus(text: string, kind?: 'info' | 'ok' | 'err' | ''): void {
  overlay?.setStatus(text, kind);
}

function bodyHtmlIdle(): string {
  return [
    renderScanBar({ info: 'Waiting for items from SkinsMonkey…', actionLabel: 'Refresh' }),
    `<div class="sh-hint">Run a scan on SkinsMonkey. The list will appear here automatically.</div>`,
  ].join('');
}

function bodyHtmlRunning(progress: number, total: number): string {
  return [
    renderScanBar({
      info: `Analyzing ${progress}/${total}…`,
      actionLabel: 'Stop',
      progressPct: total ? Math.round((progress / total) * 95) : 0,
    }),
    renderResultsHeader('Item · price · stickers', 'Profit'),
    `<div data-role="results-list"></div>`,
  ].join('');
}

function bodyHtmlDone(rows: AnalysisRow[]): string {
  return [
    renderScanBar({ info: `Analysis complete — ${rows.length} listings.`, actionLabel: 'Rescan' }),
    renderResultsHeader('Item · price · stickers', 'Profit'),
    rows.map(itemCardForRow).join('') ||
      `<div class="sh-empty">
      <div class="sh-empty-icon">⌖</div>
      <div class="sh-empty-title">No opportunities</div>
      <div class="sh-empty-sub">Try widening the filters on SkinsMonkey and rescan.</div>
    </div>`,
  ].join('');
}

function metaForItem(item: ArbitrageItem, row: AnalysisRow['result']): MetaChip[] {
  const out: MetaChip[] = [];
  out.push({ label: 'SM $' + (item.smPrice / 100).toFixed(2) });
  if (row.csfPrice != null) out.push({ label: 'CSF $' + (row.csfPrice / 100).toFixed(2) });
  if (row.estimated) out.push({ label: '⚠ Est', kind: 'warn' });
  if (item.stickers.length) out.push({ label: item.stickers.length + ' stickers' });
  if (row.flagStickers) out.push({ label: 'sticker > skin', kind: 'success' });
  if (row.flagCharm) out.push({ label: 'charm > skin', kind: 'success' });
  if (item.tradeLock) out.push({ label: '🔒 lock', kind: 'warn' });
  return out;
}

function itemCardForRow(row: AnalysisRow): string {
  const profitPct = row.result.profitPct;
  const profitFraction = profitPct / 100;
  const variant = variantByProfitPct(profitPct);
  const openUrl = buildCsfUrl(
    row.item.paintSeed,
    row.item.marketName,
    row.item.defIndex,
    row.item.paintIndex,
  );
  const props: ItemCardProps = {
    id: row.item.assetId || row.item.marketName,
    imageUrl: row.item.imageUrl || null,
    thumbEmoji: '⌖',
    name: shortExterior(row.item.marketName || '—'),
    meta: metaForItem(row.item, row.result),
    profitUsd: row.result.grossProfit / 100,
    profitFraction,
    variant,
    openUrl,
    openLabel: 'Open CSFloat ↗',
  };
  return renderItemCard(props);
}

async function analyzePayload(payload: ExportPayload): Promise<void> {
  if (!overlay) return;
  aborted = false;
  const total = payload.items.length;
  overlay.body.innerHTML = bodyHtmlRunning(0, total);
  setStatus(`Analyzing ${total} listings…`, 'info');
  wireScanBar();

  const rows: AnalysisRow[] = [];
  await runAnalysis(payload.items, {
    isAborted: () => aborted,
    onProgress: (done) => {
      if (!overlay) return;
      updateScanBar(overlay.body, {
        info: `Analyzing ${done}/${total}…`,
        progressPct: Math.round((done / total) * 95),
      });
    },
  }).then((analyzed) => {
    rows.push(...analyzed);
  });

  if (aborted) {
    setStatus('Analysis stopped.', 'info');
    return;
  }

  overlay.body.innerHTML = bodyHtmlDone(rows);
  wireScanBar();
  setStatus(
    `Found ${rows.length} listings. ${rows.filter((r) => r.result.grossProfit > 0).length} profitable.`,
    'ok',
  );

  // Report hits back to the SW so the popup feed updates.
  const hitRows = rows
    .filter((r) => r.result.grossProfit > 0)
    .slice(0, 10)
    .map(hitRowFromAnalysisRow);
  if (hitRows.length) {
    await send({ type: 'arbitrage:result', rows: hitRows });
  }
}

function wireScanBar(): void {
  if (!overlay) return;
  const btn = overlay.body.querySelector<HTMLElement>('[data-role=scan-action]');
  if (!btn) return;
  btn.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      const label = btn.textContent?.trim();
      if (label === 'Stop') {
        aborted = true;
      } else {
        // Refresh / Rescan — ask the SW to forward the pending payload again.
        void send({ type: 'arbitrage:ready' });
      }
    },
    { once: true },
  );
}

function mount(): void {
  if (overlay) return;
  overlay = createOverlay({
    rootId: ROOT_ID,
    mode: 'arbitrage',
    modeLabel: 'Arbitrage',
    persistKey: PERSIST_KEY,
    onClose: () => {
      aborted = true;
      overlay?.destroy();
      overlay = null;
    },
  });
  overlay.body.innerHTML = bodyHtmlIdle();
  wireScanBar();
  setStatus('Ready.', 'info');

  // Announce ourselves to the SW so it can forward any pending payload.
  void send({ type: 'arbitrage:ready' });
}

function handleIncoming(msg: Message): MessageResponse {
  if (msg.type === 'arbitrage:payload') {
    void analyzePayload(msg.payload);
    return { ok: true };
  }
  return { ok: false, error: 'unhandled' };
}

async function bootstrap(): Promise<void> {
  // CSFloat is the always-on Arbitrage oracle. Mode toggle in the popup
  // only affects SkinsMonkey; this overlay is mounted unconditionally.
  console.debug('[Skinsight] loaded on csfloat');
  onMessage(handleIncoming);
  mount();
}

void bootstrap();
