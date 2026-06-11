/**
 * CSFloat content script — Arbitrage oracle (v0.2).
 *
 * Listens for `arbitrage:payload` from the service worker, runs the
 * `analyzer.runAnalysis` loop (same-origin CSFloat API), and renders the
 * scored list in the overlay. Reports completion via `arbitrage:result`.
 * Results render through renderChunked — see renderDone below.
 */
import { createOverlay, type OverlayHandle } from '../modules/shared/overlay';
import {
  renderChunked,
  renderItemCard,
  renderResultsHeader,
  renderScanBar,
  renderSteamCell,
  updateScanBar,
  variantByProfitPct,
  type ChunkedRenderHandle,
  type ItemCardProps,
  type MetaChip,
} from '../modules/shared/ui';
import { getSteamPriceCached } from '../modules/oracles/steam';
import { wireSteamButtons } from '../modules/oracles/steam-ui';
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
import { shortExterior, wearCode } from '../modules/shared/fmt';
import { applyStoredLocale } from '../modules/shared/settings';
import { t } from '../modules/shared/i18n';

const ROOT_ID = 'skinsight-csf-overlay';
const PERSIST_KEY = 'csfloat';

let overlay: OverlayHandle | null = null;
let aborted = false;
/** Analysis in flight — the scan-bar button means Stop while true, otherwise
 *  Refresh/Rescan. State flag instead of comparing the button LABEL, which
 *  broke whenever the locale changed mid-session. */
let running = false;

function setStatus(text: string, kind?: 'info' | 'ok' | 'err' | ''): void {
  overlay?.setStatus(text, kind);
}

function bodyHtmlIdle(): string {
  return [
    renderScanBar({ info: t('csf.waiting'), actionLabel: t('csf.refresh') }),
    `<div class="sh-hint">${t('csf.idleHint')}</div>`,
  ].join('');
}

function bodyHtmlRunning(progress: number, total: number): string {
  return [
    renderScanBar({
      info: t('csf.analyzing', { done: progress, total }),
      actionLabel: t('scan.stop'),
      progressPct: total ? Math.round((progress / total) * 95) : 0,
    }),
    renderResultsHeader(t('csf.header.left'), t('csf.profit')),
    `<div data-role="results-list"></div>`,
  ].join('');
}

/** Live chunked render — aborted before any overlay re-render so a stale
 *  pass can't keep appending cards into a body that was just rewritten. */
let chunked: ChunkedRenderHandle | null = null;

function abortChunked(): void {
  chunked?.abort();
  chunked = null;
}

/**
 * Render the "done" state. Cards go through `renderChunked` — a large
 * arbitrage payload (thousands of rows) rendered with a synchronous
 * `.map().join('')` froze the PirateSwap tab once already; same hazard here.
 */
function renderDone(rows: AnalysisRow[]): void {
  if (!overlay) return;
  abortChunked();
  const prefixHtml = [
    renderScanBar({ info: t('csf.complete', { n: rows.length }), actionLabel: t('csf.rescan') }),
    renderResultsHeader(t('csf.header.left'), t('csf.profit')),
  ].join('');
  if (rows.length === 0) {
    overlay.body.innerHTML =
      prefixHtml +
      `<div class="sh-empty">
      <div class="sh-empty-icon">⌖</div>
      <div class="sh-empty-title">${t('csf.empty.title')}</div>
      <div class="sh-empty-sub">${t('csf.empty.sub')}</div>
    </div>`;
    return;
  }
  chunked = renderChunked({
    container: overlay.body,
    items: rows,
    render: itemCardForRow,
    prefixHtml,
  });
}

function metaForItem(item: ArbitrageItem, row: AnalysisRow['result']): MetaChip[] {
  const out: MetaChip[] = [];
  out.push({ label: 'SM $' + (item.smPrice / 100).toFixed(2) });
  if (row.csfPrice != null) out.push({ label: 'CSF $' + (row.csfPrice / 100).toFixed(2) });
  if (row.estimated) out.push({ label: t('csf.meta.est'), kind: 'warn' });
  if (item.stickers.length)
    out.push({ label: t('csf.meta.stickers', { n: item.stickers.length }) });
  if (row.flagStickers) out.push({ label: t('csf.meta.stickerGtSkin'), kind: 'success' });
  if (row.flagCharm) out.push({ label: t('csf.meta.charmGtSkin'), kind: 'success' });
  if (item.tradeLock) out.push({ label: t('csf.meta.lock'), kind: 'warn' });
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
    wear: wearCode(row.item.exterior || row.item.marketName),
    meta: metaForItem(row.item, row.result),
    profitUsd: row.result.grossProfit / 100,
    profitFraction,
    variant,
    openUrl,
    openLabel: t('csf.open'),
    steamHtml: renderSteamCell(row.item.marketName, getSteamPriceCached(row.item.marketName)),
  };
  return renderItemCard(props);
}

async function analyzePayload(payload: ExportPayload): Promise<void> {
  if (!overlay) return;
  aborted = false;
  running = true;
  abortChunked(); // a previous done-state render may still be appending
  const total = payload.items.length;
  overlay.body.innerHTML = bodyHtmlRunning(0, total);
  setStatus(t('csf.analyzingN', { n: total }), 'info');

  // try/catch/finally so a throw in the analyzer/render never leaves the
  // overlay stuck on "Analyzing…" and `running` always resets.
  try {
    const rows: AnalysisRow[] = [];
    await runAnalysis(payload.items, {
      isAborted: () => aborted,
      onProgress: (done) => {
        if (!overlay) return;
        updateScanBar(overlay.body, {
          info: t('csf.analyzing', { done, total }),
          progressPct: Math.round((done / total) * 95),
        });
      },
    }).then((analyzed) => {
      rows.push(...analyzed);
    });

    if (aborted) {
      // Render the partial result set (everything analyzed before Stop) with
      // the Rescan action — the old path returned without re-rendering and
      // left a dead "Analyzing…" bar until the next payload.
      if (overlay) {
        renderDone(rows);
        setStatus(t('csf.stopped'), 'info');
      }
      return;
    }
    if (!overlay) return;

    renderDone(rows);
    setStatus(
      t('csf.found', {
        n: rows.length,
        p: rows.filter((r) => r.result.grossProfit > 0).length,
      }),
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
  } catch (e) {
    if (overlay) {
      // Reset to the idle body (with a Refresh action) so the user can retry.
      abortChunked();
      overlay.body.innerHTML = bodyHtmlIdle();
      setStatus(t('scan.error', { msg: (e as Error)?.message ?? String(e) }), 'err');
    }
  } finally {
    running = false;
  }
}

/** One persistent delegated listener on the overlay body — survives every
 *  innerHTML rewrite (the old per-render `{ once: true }` wiring died after
 *  the first click and left a dead Stop button). */
function wireScanBar(): void {
  if (!overlay) return;
  overlay.body.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-role=scan-action]');
    if (!btn) return;
    e.preventDefault();
    if (running) {
      aborted = true;
    } else {
      // Refresh / Rescan — ask the SW to forward the pending payload again.
      void send({ type: 'arbitrage:ready' });
    }
  });
}

function mount(): void {
  if (overlay) return;
  overlay = createOverlay({
    rootId: ROOT_ID,
    mode: 'arbitrage',
    modeLabel: t('popup.modes.arb.title'),
    persistKey: PERSIST_KEY,
    // Close now hides (the shell minimizes itself); we only abort the run.
    onClose: () => {
      aborted = true;
    },
  });
  overlay.body.innerHTML = bodyHtmlIdle();
  wireScanBar();
  wireSteamButtons(overlay.body);
  setStatus(t('scan.ready'), 'info');

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
  await applyStoredLocale();
  onMessage(handleIncoming);
  mount();
}

void bootstrap();
