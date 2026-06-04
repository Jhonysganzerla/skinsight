/**
 * Options page (v0.7 T4) — opens in its own tab (manifest options_ui).
 *
 * Two persisted settings:
 *   - Language: 'auto' | 'en' | 'pt-BR'. Pushes into the i18n module via
 *     setLocaleOverride so the overlay/popup localize. This runtime override is
 *     the whole reason Skinsight ships an internal t() instead of chrome.i18n
 *     (briefing §6 deviation, documented in i18n.ts).
 *   - Default SkinsMonkey mode: 'rare' | 'arbitrage' (same setting the popup
 *     mutex controls).
 *
 * Everything re-renders in place on change; a transient "Saved ✓" confirms the
 * write. No scan UI here.
 */
import {
  getSettings,
  patchSettings,
  type LocalePref,
  type ProfitParams,
  type SkinsmonkeyMode,
} from '../modules/shared/storage';
import { applyStoredLocale } from '../modules/shared/settings';
import { setLocaleOverride, t } from '../modules/shared/i18n';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Built per render so the 'auto' label localizes after the locale is applied.
 *  ('English' / 'Português' are endonyms — intentionally not translated.) */
function localeOptions(): Array<{ value: LocalePref; label: string }> {
  return [
    { value: 'auto', label: t('options.language.auto') },
    { value: 'en', label: 'English' },
    { value: 'pt-BR', label: 'Português (BR)' },
  ];
}

function localeSectionHtml(current: LocalePref): string {
  const opts = localeOptions()
    .map(
      (o) =>
        `<option value="${o.value}" ${o.value === current ? 'selected' : ''}>${esc(o.label)}</option>`,
    )
    .join('');
  return `
    <section class="opt-card">
      <div class="opt-card-head">
        <h2 class="opt-card-title">${esc(t('options.language.label'))}</h2>
        <span class="opt-saved" data-saved="locale">${esc(t('options.saved'))}</span>
      </div>
      <p class="opt-card-desc">${esc(t('options.language.desc'))}</p>
      <select class="opt-select" id="sel-locale">${opts}</select>
    </section>
  `;
}

function modeSectionHtml(current: SkinsmonkeyMode): string {
  const btn = (mode: SkinsmonkeyMode, label: string): string =>
    `<button type="button" class="opt-seg-btn ${mode === current ? 'active' : ''}" data-mode="${mode}">${esc(label)}</button>`;
  return `
    <section class="opt-card">
      <div class="opt-card-head">
        <h2 class="opt-card-title">${esc(t('options.mode.label'))}</h2>
        <span class="opt-saved" data-saved="mode">${esc(t('options.saved'))}</span>
      </div>
      <p class="opt-card-desc">${esc(t('options.mode.desc'))}</p>
      <div class="opt-seg">
        ${btn('rare', t('popup.modes.rare.title'))}
        ${btn('arbitrage', t('popup.modes.arb.title'))}
      </div>
    </section>
  `;
}

/** Fraction (0.05) → percent display string (5). */
function pct(frac: number): string {
  return String(Math.round(frac * 1000) / 10);
}

/**
 * SM→CS.Money net-profit economics. Percentages are shown as % and stored as
 * fractions; the threshold is USD. Changing a field persists immediately
 * (no re-render, so input focus/caret is preserved while editing).
 */
function profitSectionHtml(p: ProfitParams): string {
  const numField = (key: keyof ProfitParams, label: string, value: string, unit: string): string =>
    `<label class="opt-field">
       <span>${esc(label)}</span>
       <span class="opt-num-wrap">
         <input type="number" class="opt-num" data-pf="${key}" data-unit="${unit}" min="0" step="${unit === 'usd' ? '50' : '0.5'}" value="${esc(value)}" />
         <span class="opt-unit">${unit === 'usd' ? '$' : '%'}</span>
       </span>
     </label>`;
  return `
    <section class="opt-card">
      <div class="opt-card-head">
        <h2 class="opt-card-title">${esc(t('options.profit.label'))}</h2>
        <span class="opt-saved" data-saved="profit">${esc(t('options.saved'))}</span>
      </div>
      <p class="opt-card-desc">${esc(t('options.profit.desc'))}</p>
      <div class="opt-grid">
        ${numField('sellFeeUnder', t('options.profit.sellUnder'), pct(p.sellFeeUnder), 'pct')}
        ${numField('sellFeeOver', t('options.profit.sellOver'), pct(p.sellFeeOver), 'pct')}
        ${numField('sellFeeThreshold', t('options.profit.threshold'), String(p.sellFeeThreshold), 'usd')}
        ${numField('withdrawFee', t('options.profit.withdraw'), pct(p.withdrawFee), 'pct')}
        ${numField('tradeLockDiscount', t('options.profit.tradeLock'), pct(p.tradeLockDiscount), 'pct')}
      </div>
    </section>
  `;
}

function aboutSectionHtml(version: string): string {
  return `
    <section class="opt-card">
      <h2 class="opt-card-title">${esc(t('options.about.label'))}</h2>
      <p class="opt-card-desc" style="margin-bottom:8px;">${esc(t('options.about.version', { v: version }))}</p>
      <div class="opt-about">
        <a href="https://github.com/jhonysganzerla/skinsight" target="_blank" rel="noopener">GitHub</a>
        &nbsp;·&nbsp;
        <a href="https://ko-fi.com/sganzerla" target="_blank" rel="noopener">Ko-fi</a>
      </div>
    </section>
  `;
}

function manifestVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return '0.0.0';
  }
}

function flashSaved(which: 'locale' | 'mode' | 'profit'): void {
  const el = document.querySelector<HTMLElement>(`[data-saved="${which}"]`);
  if (!el) return;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1500);
}

async function render(): Promise<void> {
  const settings = await getSettings();

  // Header (localized).
  const title = document.getElementById('title');
  const tagline = document.getElementById('tagline');
  const versionTag = document.getElementById('versionTag');
  if (title) title.textContent = t('options.title');
  if (tagline) tagline.textContent = t('options.tagline');
  if (versionTag) versionTag.textContent = 'v' + manifestVersion();
  document.title = 'Skinsight — ' + t('options.title');

  const content = document.getElementById('content');
  if (!content) return;
  content.innerHTML = [
    localeSectionHtml(settings.locale),
    modeSectionHtml(settings.skinsmonkeyMode),
    profitSectionHtml(settings.profit),
    aboutSectionHtml(manifestVersion()),
  ].join('');
}

async function onLocaleChange(value: LocalePref): Promise<void> {
  await patchSettings({ locale: value });
  // Apply immediately in this context so the re-render is localized.
  setLocaleOverride(value === 'auto' ? null : value);
  await render();
  flashSaved('locale');
}

async function onModeChange(mode: SkinsmonkeyMode): Promise<void> {
  const cur = await getSettings();
  if (cur.skinsmonkeyMode === mode) return;
  await patchSettings({ skinsmonkeyMode: mode });
  await render();
  flashSaved('mode');
}

/** Read every [data-pf] input back into a ProfitParams (% → fraction, $ raw)
 *  and persist. No re-render — keeps caret/focus while the user edits. */
async function onProfitChange(): Promise<void> {
  const content = document.getElementById('content');
  if (!content) return;
  const cur = (await getSettings()).profit;
  const next: ProfitParams = { ...cur };
  content.querySelectorAll<HTMLInputElement>('[data-pf]').forEach((el) => {
    const key = el.dataset['pf'] as keyof ProfitParams | undefined;
    if (!key) return;
    const raw = parseFloat(el.value);
    if (!Number.isFinite(raw)) return;
    next[key] = el.dataset['unit'] === 'usd' ? raw : raw / 100;
  });
  await patchSettings({ profit: next });
  flashSaved('profit');
}

function wireUp(): void {
  const content = document.getElementById('content');
  if (!content) return;
  content.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    if (target.id === 'sel-locale') {
      void onLocaleChange((target as HTMLSelectElement).value as LocalePref);
      return;
    }
    if (target.matches('[data-pf]')) {
      void onProfitChange();
    }
  });
  content.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.opt-seg-btn[data-mode]');
    if (btn) {
      e.preventDefault();
      void onModeChange(btn.dataset['mode'] as SkinsmonkeyMode);
    }
  });
}

async function bootstrap(): Promise<void> {
  await applyStoredLocale();
  wireUp();
  await render();
}

void bootstrap();
