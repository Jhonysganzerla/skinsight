/**
 * Lightweight runtime i18n for the overlay + popup (v0.7 T3).
 *
 * Why not `chrome.i18n`: it resolves the locale from the browser UI language and
 * offers no runtime override — but the options page (T4) needs a language
 * selector. So the UI uses this internal `t()` (conscious deviation from briefing
 * §6); the MANIFEST/store strings still use `_locales` via `__MSG__` (T3a).
 *
 * Locale: auto-detected from `navigator.language` (pt* → pt-BR, else en), with an
 * optional override set by the options page (`setLocaleOverride`). Detection is
 * synchronous so `t()` can be called inline while building HTML.
 *
 * Keys are flat dotted strings; each entry carries both locales. `t()` falls back
 * to en, then to the key itself. `{var}` placeholders are interpolated.
 */

export type Locale = 'en' | 'pt-BR';

let _override: Locale | null = null;

/** Set by the options page from the stored preference; null → auto-detect. */
export function setLocaleOverride(locale: Locale | null): void {
  _override = locale;
}

export function currentLocale(): Locale {
  if (_override) return _override;
  try {
    const n = (
      (globalThis as { navigator?: { language?: string } }).navigator?.language ?? 'en'
    ).toLowerCase();
    return n.startsWith('pt') ? 'pt-BR' : 'en';
  } catch {
    return 'en';
  }
}

type Entry = { en: string; 'pt-BR': string };

const STRINGS: Record<string, Entry> = {
  // ── Popup ──────────────────────────────────────────────────────────
  'popup.modes.label': { en: 'SkinsMonkey mode', 'pt-BR': 'Modo SkinsMonkey' },
  'popup.modes.pickOne': { en: 'pick one', 'pt-BR': 'escolha um' },
  'popup.modes.rare.title': { en: 'Rare stickers', 'pt-BR': 'Stickers raros' },
  'popup.modes.rare.meta': {
    en: 'Default · catches under-listed items',
    'pt-BR': 'Padrão · pega items subprecificados',
  },
  'popup.modes.arb.title': { en: 'Arbitrage', 'pt-BR': 'Arbitragem' },
  'popup.modes.arb.meta': { en: 'SM ↔ CSFloat', 'pt-BR': 'SM ↔ CSFloat' },
  'popup.sites.label': { en: 'Sites', 'pt-BR': 'Sites' },
  'popup.sites.sub.skinsmonkey': { en: 'Mode toggle above', 'pt-BR': 'Alterne o modo acima' },
  'popup.sites.sub.csfloat': {
    en: 'Always-on Arbitrage oracle',
    'pt-BR': 'Oráculo de Arbitragem (sempre on)',
  },
  'popup.sites.sub.rare': { en: 'Always-on Rare', 'pt-BR': 'Rare (sempre on)' },
  'popup.sites.activeTab': { en: 'Active tab', 'pt-BR': 'Aba ativa' },
  'popup.sites.ready': { en: 'Ready', 'pt-BR': 'Pronto' },
  'popup.hits.label': { en: "Today's hits", 'pt-BR': 'Achados de hoje' },
  'popup.hits.empty': {
    en: 'No hits yet — start scanning on any supported site.',
    'pt-BR': 'Nada ainda — escaneie em qualquer site suportado.',
  },
  'popup.rares.label': { en: 'Rare list', 'pt-BR': 'Lista de raros' },
  'popup.rares.meta': {
    en: '{count} stickers · updated {ago}',
    'pt-BR': '{count} stickers · atualizado {ago}',
  },
  'popup.rares.bundled': {
    en: 'Using the bundled list — click to fetch the published one',
    'pt-BR': 'Usando lista embutida — clique para buscar a publicada',
  },
  'popup.rares.refresh': { en: '↻ Refresh', 'pt-BR': '↻ Atualizar' },
  'popup.rares.refreshing': { en: '↻ Refreshing…', 'pt-BR': '↻ Atualizando…' },
  'popup.rares.failed': { en: 'Failed', 'pt-BR': 'Falhou' },
  'popup.donate.label': {
    en: 'Found something good? Buy a coffee',
    'pt-BR': 'Achou bom? Paga um café',
  },
  'popup.donate.pix': { en: '📱 Copy Pix', 'pt-BR': '📱 Copiar Pix' },
  'popup.donate.pixCopied': { en: '✓ Copied', 'pt-BR': '✓ Copiado' },
  'popup.donate.pixFailed': { en: 'Copy failed', 'pt-BR': 'Falha ao copiar' },
  'popup.empty.title': {
    en: 'No supported site detected',
    'pt-BR': 'Nenhum site suportado detectado',
  },
  'popup.empty.sub': {
    en: 'Open one of the supported skin trading sites and the scanner will activate automatically.',
    'pt-BR': 'Abra um dos sites de trade suportados e o scanner ativa automaticamente.',
  },
  'popup.open': { en: 'Open ↗', 'pt-BR': 'Abrir ↗' },
  // ── Relative time (fmtAgo) ─────────────────────────────────────────
  'time.now': { en: 'just now', 'pt-BR': 'agora mesmo' },
  'time.min': { en: '{n}m ago', 'pt-BR': 'há {n} min' },
  'time.hour': { en: '{n}h ago', 'pt-BR': 'há {n}h' },
  'time.day': { en: '{n}d ago', 'pt-BR': 'há {n}d' },
};

/** Translate `key` into the current locale, interpolating `{var}` placeholders. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const entry = STRINGS[key];
  let s = entry ? entry[currentLocale()] : key;
  if (vars) {
    for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
  }
  return s;
}
