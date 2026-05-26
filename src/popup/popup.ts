/**
 * Popup — toolbar icon click. Compact 360px. Reads:
 *   - `chrome.tabs.query({active:true, currentWindow:true})` to determine
 *     whether the active tab is one of the 4 supported sites.
 *   - `chrome.storage.local` for settings (mode toggles) and today's hits.
 *
 * No scan UI here — scan lives in the overlay injected on each site.
 * Mockup reference: C:\Users\Windows 11\Desktop\mockup-ui-skinsight.html
 *
 * v0.3: the two mode cards are mutually exclusive. Clicking the inactive
 * card switches `activeMode`; clicking the active card disables both.
 */
import {
  getSettings,
  patchSettings,
  getHits,
  type ActiveMode,
  type Settings,
  type TodayHit,
} from '../modules/shared/storage';

const KO_FI_URL = 'https://ko-fi.com/sganzerla';
const PIX_KEY = 'ac344236-c335-4f89-aee2-e671101d4619';

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

const SITES: SiteDef[] = [
  {
    key: 'skinsmonkey',
    label: 'SkinsMonkey',
    short: 'S',
    host: 'skinsmonkey.com',
    url: 'https://skinsmonkey.com/',
    iconBg: '#3a76ff',
    iconFg: '#fff',
    supports: ['arbitrage', 'rare'],
  },
  {
    key: 'csfloat',
    label: 'CSFloat',
    short: 'C',
    host: 'csfloat.com',
    url: 'https://csfloat.com/',
    iconBg: '#d4af37',
    iconFg: '#000',
    supports: ['arbitrage'],
  },
  {
    key: 'pirateswap',
    label: 'PirateSwap',
    short: 'P',
    host: 'pirateswap.com',
    url: 'https://pirateswap.com/',
    iconBg: '#7e3a3a',
    iconFg: '#fff',
    supports: ['rare'],
  },
  {
    key: 'csmoney',
    label: 'CS.Money',
    short: 'M',
    host: 'cs.money',
    url: 'https://cs.money/',
    iconBg: '#2c8a4a',
    iconFg: '#fff',
    supports: ['rare'],
  },
];

interface PopupState {
  settings: Settings;
  hits: TodayHit[];
  activeHost: string | null;
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
  const arbActive = s.activeMode === 'arbitrage';
  const rareActive = s.activeMode === 'rare';
  // Dim the mode a site doesn't support to set expectations.
  const arbDim = active && !active.supports.includes('arbitrage') ? ' style="opacity:.45"' : '';
  const rareDim = active && !active.supports.includes('rare') ? ' style="opacity:.45"' : '';
  return `
    <div class="popup-section">
      <div class="section-label">Modes <span style="font-weight:400;color:var(--text-dim);text-transform:none;letter-spacing:0;">— pick one</span></div>
      <div class="mode-row">
        <button class="mode-card ${arbActive ? 'active' : ''}" data-mode="arbitrage" type="button"${arbDim}>
          <div class="mode-card-title"><span class="toggle-dot"></span> Arbitrage</div>
          <div class="mode-card-meta">SM ↔ CSFloat</div>
        </button>
        <button class="mode-card ${rareActive ? 'active' : ''}" data-mode="rare" type="button"${rareDim}>
          <div class="mode-card-title"><span class="toggle-dot"></span> Rare</div>
          <div class="mode-card-meta">SM, PS, CSM</div>
        </button>
      </div>
    </div>
  `;
}

function renderSitesSection(activeHost: string | null): string {
  const rows = SITES.map((site) => {
    const isActive = activeHost
      ? activeHost === site.host || activeHost.endsWith('.' + site.host)
      : false;
    const pill = isActive
      ? '<span class="site-pill pill-active">Active tab</span>'
      : '<span class="site-pill pill-on">Ready</span>';
    return `
      <a class="site-status" href="${site.url}" data-open="${site.url}">
        <div class="site-icon" style="background:${site.iconBg};color:${site.iconFg};">${site.short}</div>
        <div class="site-name">${escHtml(site.label)}</div>
        ${pill}
      </a>
    `;
  }).join('');
  return `
    <div class="popup-section">
      <div class="section-label">Sites</div>
      ${rows}
    </div>
  `;
}

function renderHitsSection(hits: TodayHit[]): string {
  if (!hits.length) {
    return `
      <div class="popup-section">
        <div class="section-label">Today's hits</div>
        <div class="hit-row" style="justify-content:center;color:var(--text-dim);font-size:11.5px;">
          No hits yet — start scanning on any supported site.
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
      <div class="section-label">Today's hits <span class="pill-mini pill-success">${hits.length}</span></div>
      ${rows}
    </div>
  `;
}

function renderDonateSection(): string {
  return `
    <div class="popup-section">
      <div class="section-label">Achou bom? Paga um café</div>
      <div class="donate-row">
        <button class="donate-btn" id="btn-kofi" type="button">☕ Ko-fi</button>
        <button class="donate-btn" id="btn-pix" type="button">📱 Copy Pix</button>
      </div>
      <div class="footer-links">
        <a href="https://github.com/" target="_blank" rel="noopener">GitHub</a>
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
      <span class="open-link">Open ↗</span>
    </a>
  `,
  ).join('');
  return `
    <div class="popup-section">
      <div class="empty">
        <div class="empty-icon">⌖</div>
        <p class="empty-title">No supported site detected</p>
        <p class="empty-sub">Open one of the supported skin trading sites and the scanner will activate automatically.</p>
        <div class="site-list">${links}</div>
      </div>
    </div>
    ${renderDonateSection()}
  `;
}

function renderSupported(state: PopupState, active: SiteDef): string {
  return [
    renderModesSection(state.settings, active),
    renderSitesSection(state.activeHost),
    renderHitsSection(state.hits),
    renderDonateSection(),
  ].join('');
}

/** Click-handler logic for a mode card.
 *  - Clicking the currently-active card → deactivate (activeMode = null).
 *  - Clicking the other card → switch to it (mutex). */
async function toggleMode(clicked: 'arbitrage' | 'rare'): Promise<void> {
  const cur = await getSettings();
  const next: ActiveMode = cur.activeMode === clicked ? null : clicked;
  await patchSettings({ activeMode: next });
  await render();
}

async function openTab(url: string): Promise<void> {
  await chrome.tabs.create({ url });
  window.close();
}

async function copyPix(btn: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(PIX_KEY);
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = '📱 Copy Pix';
      btn.classList.remove('copied');
    }, 2000);
  } catch {
    btn.textContent = 'Copy failed';
    setTimeout(() => {
      btn.textContent = '📱 Copy Pix';
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
  });
}

async function render(): Promise<void> {
  const [settings, hits, activeHost] = await Promise.all([
    getSettings(),
    getHits(),
    readActiveHost(),
  ]);
  const state: PopupState = { settings, hits, activeHost };
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

  const content = document.getElementById('content');
  if (content) wireUp(content);
  await render();
}

void bootstrap();
