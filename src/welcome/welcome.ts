/**
 * Welcome / onboarding page (v0.7 T5). Opened once by the service worker on
 * `onInstalled` with reason === 'install' (never on update). Explains the two
 * modes, the supported sites and the basic flow. Localized via the same runtime
 * t() as the rest of the UI (locale auto-detects from navigator on a fresh
 * install, since no override is stored yet).
 */
import { applyStoredLocale } from '../modules/shared/settings';
import { t } from '../modules/shared/i18n';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SITES: Array<{ short: string; bg: string; label: string; role: string }> = [
  { short: 'S', bg: '#f5a623', label: 'SkinsMonkey', role: 'welcome.role.both' },
  { short: 'P', bg: '#8a5a2c', label: 'PirateSwap', role: 'welcome.role.rare' },
  { short: 'M', bg: '#7c4dff', label: 'CS.Money', role: 'welcome.role.rare' },
  { short: 'C', bg: '#3a76ff', label: 'CSFloat', role: 'welcome.role.arb' },
];

function modesHtml(): string {
  return `
    <section class="wel-section">
      <h2 class="wel-section-title">${esc(t('welcome.modes.title'))}</h2>
      <div class="wel-cards">
        <div class="wel-card">
          <h3>${esc(t('popup.modes.rare.title'))}<span class="badge">${esc(t('welcome.default'))}</span></h3>
          <p>${esc(t('welcome.modes.rare.desc'))}</p>
        </div>
        <div class="wel-card">
          <h3>${esc(t('popup.modes.arb.title'))}</h3>
          <p>${esc(t('welcome.modes.arb.desc'))}</p>
        </div>
      </div>
    </section>
  `;
}

function sitesHtml(): string {
  const rows = SITES.map(
    (s) => `
      <div class="wel-site">
        <span class="dot" style="background:${s.bg}">${s.short}</span>
        <span>${esc(s.label)}</span>
        <span class="role">· ${esc(t(s.role))}</span>
      </div>`,
  ).join('');
  return `
    <section class="wel-section">
      <h2 class="wel-section-title">${esc(t('welcome.sites.title'))}</h2>
      <div class="wel-sites">${rows}</div>
    </section>
  `;
}

function flowHtml(): string {
  return `
    <section class="wel-section">
      <h2 class="wel-section-title">${esc(t('welcome.flow.title'))}</h2>
      <ol class="wel-steps">
        <li>${esc(t('welcome.flow.step1'))}</li>
        <li>${esc(t('welcome.flow.step2'))}</li>
        <li>${esc(t('welcome.flow.step3'))}</li>
      </ol>
    </section>
  `;
}

function ctaHtml(): string {
  return `
    <div class="wel-cta">
      <a class="wel-btn primary" href="https://skinsmonkey.com/" target="_blank" rel="noopener">${esc(t('welcome.cta.open'))}</a>
      <a class="wel-link" href="#" id="open-options">${esc(t('welcome.cta.options'))}</a>
    </div>
  `;
}

function render(): void {
  const title = document.getElementById('title');
  const tagline = document.getElementById('tagline');
  if (title) title.textContent = t('welcome.title');
  if (tagline) tagline.textContent = t('welcome.tagline');
  document.title = t('welcome.title') + ' — Skinsight';

  const content = document.getElementById('content');
  if (!content) return;
  content.innerHTML = [modesHtml(), sitesHtml(), flowHtml(), ctaHtml()].join('');

  content.querySelector('#open-options')?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

async function bootstrap(): Promise<void> {
  await applyStoredLocale();
  render();
}

void bootstrap();
