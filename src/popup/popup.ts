/**
 * Popup — toolbar icon click. Compact 360px. Reads:
 *   - `chrome.tabs.query({active:true, currentWindow:true})` to determine
 *     whether the active tab is one of the 4 supported sites.
 *   - `chrome.storage.local` for settings (mode toggles) and today's hits.
 *
 * No scan UI here — scan lives in the overlay injected on each site.
 * Mockup reference: mockup-ui-skinsight.html (maintainer's design notes).
 *
 * v0.4: per-site mutex. The mode toggle controls SkinsMonkey only;
 * PirateSwap and CS.Money are always-on Rare, CSFloat is always-on Arbitrage
 * oracle. The two cards in the popup are mutually exclusive (mutex), and
 * clicking the active card is a no-op (we don't let the user disable
 * SkinsMonkey entirely — they can just close the overlay there).
 */
import {
  getSettings,
  patchSettings,
  getHits,
  type RareSubmode,
  type Settings,
  type SkinsmonkeyMode,
  type TodayHit,
} from '../modules/shared/storage';
import { send } from '../modules/shared/messaging';
import { applyStoredLocale } from '../modules/shared/settings';
import { t } from '../modules/shared/i18n';
import pixData from '../modules/shared/pix.json';

const KO_FI_URL = 'https://ko-fi.com/sganzerla';
// Full Pix "copia e cola" (BR Code). Same string the QR encodes — copying just
// the raw key UUID is not accepted as copia-e-cola by many bank apps.
const PIX_PAYLOAD = pixData.payload;

interface SiteDef {
  key: 'skinsmonkey' | 'csfloat' | 'pirateswap' | 'csmoney';
  label: string;
  short: string;
  /** Single hostname or hostname suffix used for `endsWith`. */
  host: string;
  /** Default URL to open. */
  url: string;
  iconBg: string;
  iconFg: string;
  /** Which modes this site supports. */
  supports: Array<'arbitrage' | 'rare'>;
}

// Order: SkinsMonkey, PirateSwap, CS.Money, then CSFloat last (it's the
// always-on Arbitrage oracle, not a scan target). Per-site colors:
// SM yellow, PS brown, CS.Money purple, CSFloat blue.
const SITES: SiteDef[] = [
  {
    key: 'skinsmonkey',
    label: 'SkinsMonkey',
    short: 'S',
    host: 'skinsmonkey.com',
    url: 'https://skinsmonkey.com/',
    iconBg: '#f5a623',
    iconFg: '#0c0f16',
    supports: ['arbitrage', 'rare'],
  },
  {
    key: 'pirateswap',
    label: 'PirateSwap',
    short: 'P',
    host: 'pirateswap.com',
    url: 'https://pirateswap.com/',
    iconBg: '#8a5a2c',
    iconFg: '#fff',
    supports: ['rare'],
  },
  {
    key: 'csmoney',
    label: 'CS.Money',
    short: 'M',
    host: 'cs.money',
    url: 'https://cs.money/',
    iconBg: '#7c4dff',
    iconFg: '#fff',
    supports: ['rare'],
  },
  {
    key: 'csfloat',
    label: 'CSFloat',
    short: 'C',
    host: 'csfloat.com',
    url: 'https://csfloat.com/',
    iconBg: '#3a76ff',
    iconFg: '#fff',
    supports: ['arbitrage'],
  },
];

interface RareListStatus {
  count: number;
  fetchedAt: number;
}

interface PopupState {
  settings: Settings;
  hits: TodayHit[];
  activeHost: string | null;
  rareStatus: RareListStatus | null;
}

async function readRareStatus(): Promise<RareListStatus | null> {
  try {
    const r = await send({ type: 'rares:status' });
    return r.ok && r.data ? (r.data as RareListStatus) : null;
  } catch {
    return null;
  }
}

/** Human-friendly "time since" for the rare-list timestamp (localized). */
function fmtAgo(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return t('time.now');
  if (min < 60) return t('time.min', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('time.hour', { n: h });
  return t('time.day', { n: Math.floor(h / 24) });
}

function escHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readActiveHost(): Promise<string | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return null;
    const u = new URL(tab.url);
    return u.hostname;
  } catch {
    return null;
  }
}

function siteForHost(host: string | null): SiteDef | null {
  if (!host) return null;
  for (const s of SITES) {
    if (host === s.host || host.endsWith('.' + s.host)) return s;
  }
  return null;
}

function renderModesSection(s: Settings, active: SiteDef | null): string {
  const rareActive = s.skinsmonkeyMode === 'rare';
  const arbActive = s.skinsmonkeyMode === 'arbitrage';
  // Dim the entire section when the active tab isn't SkinsMonkey — the mutex
  // only governs SkinsMonkey, so showing toggles on PS/CSM/CSFloat is
  // misleading. (We still render them for context; just at lower opacity.)
  const sectionDim = active && active.key !== 'skinsmonkey' ? ' style="opacity:.55"' : '';
  // Rare first — v0.4 repositioning. Skinsight is primarily a rare scanner.
  return `
    <div class="popup-section"${sectionDim}>
      <div class="section-label">${escHtml(t('popup.modes.label'))} <span style="font-weight:400;color:var(--text-dim);text-transform:none;letter-spacing:0;">— ${escHtml(t('popup.modes.pickOne'))}</span></div>
      <div class="mode-row">
        <button class="mode-card ${rareActive ? 'active' : ''}" data-mode="rare" type="button">
          <div class="mode-card-title"><span class="toggle-dot"></span> ${escHtml(t('popup.modes.rare.title'))}</div>
          <div class="mode-card-meta">${escHtml(t('popup.modes.rare.meta'))}</div>
        </button>
        <button class="mode-card ${arbActive ? 'active' : ''}" data-mode="arbitrage" type="button">
          <div class="mode-card-title"><span class="toggle-dot"></span> ${escHtml(t('popup.modes.arb.title'))}</div>
          <div class="mode-card-meta">${escHtml(t('popup.modes.arb.meta'))}</div>
        </button>
      </div>
    </div>
  `;
}

/** Rare detector sub-toggle (v0.9): Stickers ⇄ Patterns. Applies to every
 *  Rare scanner (SM-rare, PirateSwap, CS.Money) — one switch covers all three. */
function renderRareSubmodeSection(s: Settings): string {
  const sticker = s.rareSubmode === 'sticker';
  const pattern = s.rareSubmode === 'pattern';
  return `
    <div class="popup-section">
      <div class="section-label">${escHtml(t('pattern.submode.label'))}</div>
      <div class="mode-row">
        <button class="mode-card ${sticker ? 'active' : ''}" data-submode="sticker" type="button">
          <div class="mode-card-title"><span class="toggle-dot"></span> ${escHtml(t('pattern.submode.sticker'))}</div>
        </button>
        <button class="mode-card ${pattern ? 'active' : ''}" data-submode="pattern" type="button">
          <div class="mode-card-title"><span class="toggle-dot"></span> ${escHtml(t('pattern.submode.pattern'))}</div>
        </button>
      </div>
    </div>
  `;
}

function siteSubtitle(site: SiteDef): string {
  if (site.key === 'skinsmonkey') return t('popup.sites.sub.skinsmonkey');
  if (site.key === 'csfloat') return t('popup.sites.sub.csfloat');
  return t('popup.sites.sub.rare');
}

function renderSitesSection(activeHost: string | null): string {
  const rows = SITES.map((site) => {
    const isActive = activeHost
      ? activeHost === site.host || activeHost.endsWith('.' + site.host)
      : false;
    const pill = isActive
      ? `<span class="site-pill pill-active">${escHtml(t('popup.sites.activeTab'))}</span>`
      : `<span class="site-pill pill-on">${escHtml(t('popup.sites.ready'))}</span>`;
    return `
      <a class="site-status" href="${site.url}" data-open="${site.url}">
        <div class="site-icon" style="background:${site.iconBg};color:${site.iconFg};">${site.short}</div>
        <div style="flex:1;min-width:0;">
          <div class="site-name">${escHtml(site.label)}</div>
          <div style="font-size:10.5px;color:var(--text-dim);">${escHtml(siteSubtitle(site))}</div>
        </div>
        ${pill}
      </a>
    `;
  }).join('');
  return `
    <div class="popup-section">
      <div class="section-label">${escHtml(t('popup.sites.label'))}</div>
      ${rows}
    </div>
  `;
}

function renderHitsSection(hits: TodayHit[]): string {
  if (!hits.length) {
    return `
      <div class="popup-section">
        <div class="section-label">${escHtml(t('popup.hits.label'))}</div>
        <div class="hit-row" style="justify-content:center;color:var(--text-dim);font-size:11.5px;">
          ${escHtml(t('popup.hits.empty'))}
        </div>
      </div>
    `;
  }
  const top = hits.slice(0, 3);
  const rows = top
    .map(
      (h) => `
      <div class="hit-row">
        <div class="hit-thumb">⌖</div>
        <div class="hit-meta">
          <div class="hit-name">${escHtml(h.name)}</div>
          <div class="hit-sub">${escHtml(h.sub)}</div>
        </div>
        <div class="hit-profit">+$${h.profitUsd.toFixed(2)}</div>
      </div>
    `,
    )
    .join('');
  return `
    <div class="popup-section">
      <div class="section-label">${escHtml(t('popup.hits.label'))} <span class="pill-mini pill-success">${hits.length}</span></div>
      ${rows}
    </div>
  `;
}

function renderRareListSection(status: RareListStatus | null): string {
  const meta = status
    ? t('popup.rares.meta', { count: status.count, ago: fmtAgo(status.fetchedAt) })
    : t('popup.rares.bundled');
  return `
    <div class="popup-section">
      <div class="section-label">${escHtml(t('popup.rares.label'))}</div>
      <div style="display:flex;align-items:center;gap:8px;justify-content:space-between;">
        <div style="font-size:11px;color:var(--text-dim);flex:1;min-width:0;">${escHtml(meta)}</div>
        <button class="donate-btn" id="btn-refresh-rares" type="button" style="flex:0 0 auto;">${escHtml(t('popup.rares.refresh'))}</button>
      </div>
    </div>
  `;
}

function renderDonateSection(): string {
  return `
    <div class="popup-section">
      <div class="section-label">${escHtml(t('popup.donate.label'))}</div>
      <div class="donate-row">
        <button class="donate-btn" id="btn-kofi" type="button">☕ Ko-fi</button>
        <button class="donate-btn" id="btn-pix" type="button">${escHtml(t('popup.donate.pix'))}</button>
      </div>
      <button class="donate-btn donate-qr-toggle" id="btn-toggle-qr" type="button"
        data-show="${escHtml(t('popup.donate.showQr'))}" data-hide="${escHtml(t('popup.donate.hideQr'))}">${escHtml(t('popup.donate.showQr'))}</button>
      <div class="pix-qr-block" id="pix-qr-block">
        <img class="pix-qr" src="/pix-qr.svg" alt="QR Code Pix" width="160" height="160" />
        <div class="pix-qr-hint">${escHtml(t('popup.donate.qrHint'))}</div>
      </div>
      <div class="footer-links">
        <a href="#" id="btn-options">${escHtml(t('popup.options'))}</a>
        <a href="https://github.com/jhonysganzerla/skinsight" target="_blank" rel="noopener">GitHub</a>
      </div>
    </div>
  `;
}

function renderEmptyState(): string {
  const links = SITES.map(
    (s) => `
    <a class="site-status" href="${s.url}" data-open="${s.url}">
      <div class="site-icon" style="background:${s.iconBg};color:${s.iconFg};">${s.short}</div>
      <div class="site-name">${escHtml(s.label)}</div>
      <span class="open-link">${escHtml(t('popup.open'))}</span>
    </a>
  `,
  ).join('');
  return `
    <div class="popup-section">
      <div class="empty">
        <div class="empty-icon">⌖</div>
        <p class="empty-title">${escHtml(t('popup.empty.title'))}</p>
        <p class="empty-sub">${escHtml(t('popup.empty.sub'))}</p>
        <div class="site-list">${links}</div>
      </div>
    </div>
    ${renderDonateSection()}
  `;
}

function renderSupported(state: PopupState, active: SiteDef): string {
  return [
    renderModesSection(state.settings, active),
    renderRareSubmodeSection(state.settings),
    renderSitesSection(state.activeHost),
    renderRareListSection(state.rareStatus),
    renderHitsSection(state.hits),
    renderDonateSection(),
  ].join('');
}

/** Click-handler logic for a SkinsMonkey mode card.
 *  Mutex: clicking the active card is a no-op; clicking the other switches. */
async function toggleMode(clicked: SkinsmonkeyMode): Promise<void> {
  const cur = await getSettings();
  if (cur.skinsmonkeyMode === clicked) return;
  await patchSettings({ skinsmonkeyMode: clicked });
  await render();
}

async function toggleSubmode(clicked: RareSubmode): Promise<void> {
  const cur = await getSettings();
  if (cur.rareSubmode === clicked) return;
  await patchSettings({ rareSubmode: clicked });
  await render();
}

async function openTab(url: string): Promise<void> {
  await chrome.tabs.create({ url });
  window.close();
}

async function copyPix(btn: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(PIX_PAYLOAD);
    btn.textContent = t('popup.donate.pixCopied');
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = t('popup.donate.pix');
      btn.classList.remove('copied');
    }, 2000);
  } catch {
    btn.textContent = t('popup.donate.pixFailed');
    setTimeout(() => {
      btn.textContent = t('popup.donate.pix');
    }, 2000);
  }
}

function wireUp(root: HTMLElement): void {
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const modeBtn = t.closest<HTMLElement>('.mode-card[data-mode]');
    if (modeBtn) {
      e.preventDefault();
      void toggleMode(modeBtn.dataset['mode'] as 'arbitrage' | 'rare');
      return;
    }
    const subBtn = t.closest<HTMLElement>('.mode-card[data-submode]');
    if (subBtn) {
      e.preventDefault();
      void toggleSubmode(subBtn.dataset['submode'] as RareSubmode);
      return;
    }
    const opener = t.closest<HTMLElement>('[data-open]');
    if (opener && opener.dataset['open']) {
      e.preventDefault();
      void openTab(opener.dataset['open']);
      return;
    }
    if (t.id === 'btn-kofi') {
      e.preventDefault();
      void openTab(KO_FI_URL);
      return;
    }
    if (t.id === 'btn-pix') {
      e.preventDefault();
      void copyPix(t);
      return;
    }
    if (t.id === 'btn-toggle-qr') {
      e.preventDefault();
      const block = root.querySelector('#pix-qr-block');
      const open = block?.classList.toggle('show');
      t.textContent = open ? t.dataset['hide'] || '' : t.dataset['show'] || '';
      return;
    }
    if (t.id === 'btn-refresh-rares') {
      e.preventDefault();
      void refreshRares(t);
      return;
    }
    if (t.id === 'btn-options') {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
      window.close();
      return;
    }
  });
}

/** Force a remote rare-list refresh via the SW, then re-render the popup. */
async function refreshRares(btn: HTMLElement): Promise<void> {
  const original = btn.textContent;
  btn.textContent = t('popup.rares.refreshing');
  (btn as HTMLButtonElement).disabled = true;
  let r: Awaited<ReturnType<typeof send>>;
  try {
    r = await send({ type: 'rares:refresh', force: true });
  } catch (e) {
    r = { ok: false, error: String((e as Error)?.message ?? e) };
  }
  if (r.ok) {
    // render() rebuilds the section (and its button) from fresh status.
    await render();
    return;
  }
  btn.textContent = t('popup.rares.failed');
  setTimeout(() => {
    btn.textContent = original;
    (btn as HTMLButtonElement).disabled = false;
  }, 2000);
}

async function render(): Promise<void> {
  const [settings, hits, activeHost, rareStatus] = await Promise.all([
    getSettings(),
    getHits(),
    readActiveHost(),
    readRareStatus(),
  ]);
  const state: PopupState = { settings, hits, activeHost, rareStatus };
  const active = siteForHost(activeHost);
  const content = document.getElementById('content');
  if (!content) return;
  content.innerHTML = active ? renderSupported(state, active) : renderEmptyState();
}

async function bootstrap(): Promise<void> {
  // Version tag from manifest.
  try {
    const m = chrome.runtime.getManifest();
    const tag = document.getElementById('versionTag');
    if (tag) tag.textContent = 'v' + m.version;
  } catch {
    /* ignore */
  }

  await applyStoredLocale();
  const content = document.getElementById('content');
  if (content) wireUp(content);
  await render();
}

void bootstrap();
