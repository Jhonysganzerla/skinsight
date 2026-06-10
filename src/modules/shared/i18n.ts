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
  'popup.donate.showQr': { en: '📷 Show Pix QR', 'pt-BR': '📷 Mostrar QR Pix' },
  'popup.donate.hideQr': { en: '📷 Hide Pix QR', 'pt-BR': '📷 Ocultar QR Pix' },
  'popup.donate.qrHint': {
    en: 'Scan with your bank app — optional donation, any amount.',
    'pt-BR': 'Escaneie no app do banco — doação opcional, qualquer valor.',
  },
  'popup.empty.title': {
    en: 'No supported site detected',
    'pt-BR': 'Nenhum site suportado detectado',
  },
  'popup.empty.sub': {
    en: 'Open one of the supported skin trading sites and the scanner will activate automatically.',
    'pt-BR': 'Abra um dos sites de trade suportados e o scanner ativa automaticamente.',
  },
  'popup.open': { en: 'Open ↗', 'pt-BR': 'Abrir ↗' },
  'popup.options': { en: '⚙ Options', 'pt-BR': '⚙ Opções' },
  // ── Options page (v0.7 T4) ─────────────────────────────────────────
  'options.title': { en: 'Options', 'pt-BR': 'Opções' },
  'options.tagline': {
    en: 'Configure Skinsight',
    'pt-BR': 'Configurar o Skinsight',
  },
  'options.language.label': { en: 'Language', 'pt-BR': 'Idioma' },
  'options.language.desc': {
    en: 'Language for the overlay and popup. Takes effect immediately.',
    'pt-BR': 'Idioma do overlay e do popup. Aplica na hora.',
  },
  'options.language.auto': { en: 'Automatic (system)', 'pt-BR': 'Automático (sistema)' },
  'options.mode.label': { en: 'Default SkinsMonkey mode', 'pt-BR': 'Modo padrão do SkinsMonkey' },
  'options.mode.desc': {
    en: 'Which scanner runs on SkinsMonkey. PirateSwap and CS.Money are always Rare; CSFloat is always the Arbitrage oracle.',
    'pt-BR':
      'Qual scanner roda no SkinsMonkey. PirateSwap e CS.Money são sempre Rare; o CSFloat é sempre o oráculo de Arbitragem.',
  },
  'options.profit.label': {
    en: 'Profit estimate (SM→CS.Money)',
    'pt-BR': 'Estimativa de lucro (SM→CS.Money)',
  },
  'options.profit.desc': {
    en: 'Fees used for the net "possível lucro" on rare cards. Defaults match CS.Money Market; adjust to your account.',
    'pt-BR':
      'Taxas usadas no "possível lucro" líquido dos cards. Padrões da CS.Money Market; ajuste para a sua conta.',
  },
  'options.profit.sellUnder': {
    en: 'Sell fee · under threshold',
    'pt-BR': 'Taxa de venda · abaixo do limite',
  },
  'options.profit.sellOver': {
    en: 'Sell fee · at/above threshold',
    'pt-BR': 'Taxa de venda · no/acima do limite',
  },
  'options.profit.threshold': { en: 'Fee tier threshold', 'pt-BR': 'Limite das faixas' },
  'options.profit.withdraw': { en: 'Withdraw fee', 'pt-BR': 'Taxa de saque' },
  'options.profit.tradeLock': { en: 'Trade-lock discount', 'pt-BR': 'Desconto de trade-lock' },
  'options.about.label': { en: 'About', 'pt-BR': 'Sobre' },
  'options.about.version': { en: 'Version {v}', 'pt-BR': 'Versão {v}' },
  'options.saved': { en: 'Saved ✓', 'pt-BR': 'Salvo ✓' },
  // ── Welcome / onboarding (v0.7 T5) ─────────────────────────────────
  'welcome.title': { en: 'Welcome to Skinsight', 'pt-BR': 'Bem-vindo ao Skinsight' },
  'welcome.tagline': {
    en: 'Rare sticker scanner for CS2 skin trading.',
    'pt-BR': 'Scanner de stickers raros para trade de skins de CS2.',
  },
  'welcome.default': { en: 'default', 'pt-BR': 'padrão' },
  'welcome.modes.title': { en: 'Two modes', 'pt-BR': 'Dois modos' },
  'welcome.modes.rare.desc': {
    en: 'Scans inventories for items whose stickers are worth more than the listing — the under-priced finds.',
    'pt-BR':
      'Varre inventários atrás de itens cujos stickers valem mais que o anúncio — os achados subprecificados.',
  },
  'welcome.modes.arb.desc': {
    en: 'Cross-site price arbitrage: hands a SkinsMonkey scan to CSFloat and scores the spread.',
    'pt-BR':
      'Arbitragem de preço entre sites: leva um scan do SkinsMonkey ao CSFloat e pontua a diferença.',
  },
  'welcome.sites.title': { en: 'Supported sites', 'pt-BR': 'Sites suportados' },
  'welcome.role.both': { en: 'Rare + Arbitrage', 'pt-BR': 'Rare + Arbitragem' },
  'welcome.role.rare': { en: 'always-on Rare', 'pt-BR': 'Rare sempre ativo' },
  'welcome.role.arb': { en: 'Arbitrage oracle', 'pt-BR': 'oráculo de Arbitragem' },
  'welcome.flow.title': { en: 'How it works', 'pt-BR': 'Como funciona' },
  'welcome.flow.step1': {
    en: 'Open a supported site — the Skinsight overlay activates automatically.',
    'pt-BR': 'Abra um site suportado — o overlay do Skinsight ativa sozinho.',
  },
  'welcome.flow.step2': {
    en: 'Hit Scan. Rare mode lists items with valuable stickers; Arbitrage hands off to CSFloat.',
    'pt-BR':
      'Clique em Escanear. O modo Rare lista itens com stickers valiosos; Arbitragem repassa ao CSFloat.',
  },
  'welcome.flow.step3': {
    en: 'Review the cards — Steam price, sticker breakdown and the estimated CS.Money bonus.',
    'pt-BR': 'Confira os cards — preço Steam, detalhe dos stickers e o bônus estimado da CS.Money.',
  },
  'welcome.cta.open': { en: 'Open SkinsMonkey ↗', 'pt-BR': 'Abrir o SkinsMonkey ↗' },
  'welcome.cta.options': { en: 'Open options', 'pt-BR': 'Abrir opções' },
  // ── Overlay shell ──────────────────────────────────────────────────
  'overlay.minimize': { en: 'Minimize', 'pt-BR': 'Minimizar' },
  'overlay.close': { en: 'Close', 'pt-BR': 'Fechar' },
  'overlay.minbar.open': { en: 'open', 'pt-BR': 'abrir' },
  // ── Filters (shared across the rare scanners) ──────────────────────
  'filter.maxPages': { en: 'Max pages', 'pt-BR': 'Máx. páginas' },
  'filter.maxPages.hint': {
    en: 'Blank = scan the whole inventory (capped at the safety limit).',
    'pt-BR': 'Em branco = escaneia o inventário todo (até o limite de segurança).',
  },
  'filter.maxPrice': { en: 'Max price ($)', 'pt-BR': 'Preço máx ($)' },
  'filter.delayMs': { en: 'Delay (ms)', 'pt-BR': 'Delay (ms)' },
  'filter.sort': { en: 'Sort', 'pt-BR': 'Ordenar' },
  'filter.search': { en: 'Search', 'pt-BR': 'Buscar' },
  'filter.pages': { en: 'Pages', 'pt-BR': 'Páginas' },
  'filter.exteriors': { en: 'Exteriors', 'pt-BR': 'Exteriores' },
  'filter.ph.none': { en: 'none', 'pt-BR': 'nenhum' },
  'filter.ph.all': { en: 'all', 'pt-BR': 'tudo' },
  'filter.ph.allStar': { en: '* (all)', 'pt-BR': '* (tudo)' },
  // ── Exterior options (SkinsMonkey arbitrage) ───────────────────────
  'ext.all': { en: 'All', 'pt-BR': 'Tudo' },
  'ext.fnmw': { en: 'FN + MW', 'pt-BR': 'FN + MW' },
  'ext.ftwwbs': { en: 'FT + WW + BS', 'pt-BR': 'FT + WW + BS' },
  // ── Sort options ───────────────────────────────────────────────────
  'sort.roi': { en: 'ROI ↓', 'pt-BR': 'ROI ↓' },
  'sort.stickerSum': { en: 'Stickers $ ↓', 'pt-BR': 'Stickers $ ↓' },
  'sort.profit': { en: 'Profit ↓', 'pt-BR': 'Lucro ↓' },
  'sort.priceAsc': { en: 'Price ↑', 'pt-BR': 'Preço ↑' },
  'sort.priceDesc': { en: 'Price ↓', 'pt-BR': 'Preço ↓' },
  'sort.netDesc': { en: 'Net $ ↓', 'pt-BR': 'Líquido $ ↓' },
  'sort.weaponAsc': { en: 'Cheapest weapon ↑', 'pt-BR': 'Arma mais barata ↑' },
  'sort.countDesc': { en: 'Sticker count ↓', 'pt-BR': 'Qtde de stickers ↓' },
  // ── Scan bar / status (shared) ─────────────────────────────────────
  'scan.scan': { en: 'Scan', 'pt-BR': 'Escanear' },
  'scan.stop': { en: 'Stop', 'pt-BR': 'Parar' },
  'scan.readyHint': { en: 'Ready. Click Scan to begin.', 'pt-BR': 'Pronto. Clique em Escanear.' },
  'scan.ready': { en: 'Ready.', 'pt-BR': 'Pronto.' },
  'scan.stopped': { en: 'Scan stopped.', 'pt-BR': 'Scan interrompido.' },
  'scan.failed': { en: 'Scan failed.', 'pt-BR': 'Scan falhou.' },
  'scan.error': { en: 'Scan error: {msg}', 'pt-BR': 'Erro no scan: {msg}' },
  'scan.renderError': { en: 'Render error: {msg}', 'pt-BR': 'Erro de render: {msg}' },
  'scan.matching': {
    en: 'Matching {n} items against rare DB…',
    'pt-BR': 'Comparando {n} items com a DB de raros…',
  },
  'scan.complete.hits': { en: 'Scan complete — {n} hits.', 'pt-BR': 'Scan completo — {n} hits.' },
  'scan.page': {
    en: 'Page {i}/{n} (offset {off})…',
    'pt-BR': 'Página {i}/{n} (offset {off})…',
  },
  'scan.scannedPages': {
    en: 'Scanned {p} pages ({n} items)…',
    'pt-BR': '{p} páginas escaneadas ({n} items)…',
  },
  // ── Results headers ────────────────────────────────────────────────
  'results.worth': { en: 'Worth', 'pt-BR': 'Valor' },
  'results.net': { en: 'Net', 'pt-BR': 'Líquido' },
  'results.header.detected': {
    en: 'Item · stickers detected',
    'pt-BR': 'Item · stickers detectados',
  },
  'results.header.stickers': { en: 'Item · stickers', 'pt-BR': 'Item · stickers' },
  // ── PirateSwap ─────────────────────────────────────────────────────
  'ps.scanning': {
    en: 'Scanning PirateSwap inventory until empty…',
    'pt-BR': 'Escaneando o inventário do PirateSwap até o fim…',
  },
  'ps.scanningShort': { en: 'Scanning inventory…', 'pt-BR': 'Escaneando inventário…' },
  'ps.throttle': {
    en: 'PirateSwap throttling — waiting {s}s (page {p})…',
    'pt-BR': 'PirateSwap limitando — aguardando {s}s (página {p})…',
  },
  'rare.empty.title': {
    en: 'No rare stickers found',
    'pt-BR': 'Nenhum sticker raro encontrado',
  },
  'rare.empty.sub': {
    en: 'Widen filters or scan more pages.',
    'pt-BR': 'Amplie os filtros ou escaneie mais páginas.',
  },
  'rare.found': {
    en: 'Found {n} items with rare stickers.',
    'pt-BR': '{n} items com stickers raros.',
  },
  'rare.csmoneyBonusEst': { en: 'CS.Money bonus (est.)', 'pt-BR': 'bônus CS.Money (est.)' },
  'rare.netProfitEst': { en: 'net (est.)', 'pt-BR': 'lucro líq. (est.)' },
  // ── Rare Pattern (v0.9) ────────────────────────────────────────────
  'pattern.title': { en: 'Rare patterns', 'pt-BR': 'Patterns raros' },
  'pattern.submode.sticker': { en: 'Stickers', 'pt-BR': 'Stickers' },
  'pattern.submode.pattern': { en: 'Patterns', 'pt-BR': 'Patterns' },
  'pattern.submode.label': { en: 'Rare scanner', 'pt-BR': 'Scanner Rare' },
  'pattern.seed': { en: 'seed', 'pt-BR': 'seed' },
  'pattern.listed': { en: 'Listed', 'pt-BR': 'Anúncio' },
  'pattern.csfloat': { en: 'CSFloat ↗', 'pt-BR': 'CSFloat ↗' },
  'pattern.inspect': { en: '🔎 Inspect in-game', 'pt-BR': '🔎 Inspecionar in-game' },
  'pattern.site': { en: 'Find on site ↗', 'pt-BR': 'Ver no site ↗' },
  'pattern.querying': {
    en: 'Searching skin {i}/{n}: {name} (page {p})…',
    'pt-BR': 'Buscando skin {i}/{n}: {name} (pág. {p})…',
  },
  'scan.schemaWarn': {
    en: 'Unexpected site response format — results may be empty (the site may have changed its API).',
    'pt-BR':
      'Resposta do site em formato inesperado — resultados podem vir vazios (o site pode ter mudado a API).',
  },
  'pattern.results.header': { en: 'Item · seed · tier', 'pt-BR': 'Item · seed · tier' },
  'pattern.results.right': { en: 'Pattern', 'pt-BR': 'Pattern' },
  'pattern.tabs.all': { en: 'All', 'pt-BR': 'Todas' },
  'pattern.st': { en: 'StatTrak™ only', 'pt-BR': 'Só StatTrak™' },
  'pattern.sort.default': { en: 'Default order', 'pt-BR': 'Ordem padrão' },
  'pattern.count': { en: '{n} items', 'pt-BR': '{n} itens' },
  'pattern.partial': {
    en: 'Stopped — {n} partial hits.',
    'pt-BR': 'Interrompido — {n} hits parciais.',
  },
  'pattern.failedSkins': {
    en: '{m} skin queries failed',
    'pt-BR': '{m} buscas de skin falharam',
  },
  'pattern.throttled': {
    en: 'possibly partial (site rate limit)',
    'pt-BR': 'possivelmente parcial (limite do site)',
  },
  'pattern.tier': { en: 'Tier', 'pt-BR': 'Tier' },
  'pattern.tier.all': { en: 'All tiers', 'pt-BR': 'Todos os tiers' },
  'pattern.tier.t1': { en: 'T1 + specials', 'pt-BR': 'T1 + especiais' },
  'pattern.tier.t2': { en: 'T1–T2 + specials', 'pt-BR': 'T1–T2 + especiais' },
  'ps.apiChanged': {
    en: 'PirateSwap search may have changed — no skin resolved. Try updating the extension.',
    'pt-BR':
      'A busca do PirateSwap pode ter mudado — nenhuma skin resolveu. Tente atualizar a extensão.',
  },
  'pattern.empty.title': {
    en: 'No rare patterns found',
    'pt-BR': 'Nenhum pattern raro encontrado',
  },
  'pattern.empty.sub': {
    en: 'Scan more pages — rare seeds are uncommon.',
    'pt-BR': 'Escaneie mais páginas — seeds raros são incomuns.',
  },
  'pattern.found': {
    en: 'Found {n} items with rare patterns.',
    'pt-BR': '{n} items com patterns raros.',
  },
  // ── CS.Money ───────────────────────────────────────────────────────
  'csm.collecting': { en: 'Collecting…', 'pt-BR': 'Coletando…' },
  'csm.collectingInv': {
    en: 'Collecting CS.Money inventory…',
    'pt-BR': 'Coletando inventário do CS.Money…',
  },
  'csm.empty.title': { en: 'No items collected', 'pt-BR': 'Nenhum item coletado' },
  'csm.empty.sub': {
    en: 'Try increasing pages or check CS.Money rate limit.',
    'pt-BR': 'Aumente as páginas ou cheque o rate limit do CS.Money.',
  },
  'csm.complete': {
    en: 'Scan complete — {n} items, {p} profitable.',
    'pt-BR': 'Scan completo — {n} items, {p} lucrativos.',
  },
  'csm.collected': { en: 'Collected {n} items.', 'pt-BR': '{n} items coletados.' },
  'csm.page': {
    en: 'Collecting page {p} ({n} items)…',
    'pt-BR': 'Coletando página {p} ({n} items)…',
  },
  // ── CS.Money rare-DB regenerate drawer ─────────────────────────────
  'regen.title': { en: '⚙ Rare-DB maintenance', 'pt-BR': '⚙ Manutenção da Rare-DB' },
  'regen.desc': {
    en: 'Downloads a fresh rare_stickers.json report from the current CS.Money inventory. The bundled DB is updated only via Skinsight releases — this button just produces the file for the maintainer.',
    'pt-BR':
      'Baixa um relatório rare_stickers.json novo a partir do inventário atual da CS.Money. A DB embutida só é atualizada via releases do Skinsight — este botão apenas gera o arquivo para o mantenedor.',
  },
  'regen.collectFirst': { en: 'Collect inventory first', 'pt-BR': 'Colete o inventário primeiro' },
  'regen.button': {
    en: 'Regenerate rare_stickers.json',
    'pt-BR': 'Regenerar rare_stickers.json',
  },
  'regen.stop': { en: 'Stop regenerate', 'pt-BR': 'Parar regeneração' },
  'regen.running': {
    en: 'Regenerating rare DB — deep-scanning CS.Money…',
    'pt-BR': 'Regenerando a rare DB — varredura profunda da CS.Money…',
  },
  'regen.progress': {
    en: 'Scanned {p} pages — {t} elapsed. {msg}',
    'pt-BR': '{p} páginas — {t} decorridos. {msg}',
  },
  'regen.stopped': {
    en: 'Regenerate stopped after {p} pages ({t}).',
    'pt-BR': 'Regeneração parada após {p} páginas ({t}).',
  },
  'regen.done': {
    en: 'Downloaded rare_stickers.json — {p} pages, {n} rare stickers (≥ ${thr}) in {t}.',
    'pt-BR': 'rare_stickers.json baixado — {p} páginas, {n} stickers raros (≥ ${thr}) em {t}.',
  },
  // ── SkinsMonkey (arbitrage + rare) ─────────────────────────────────
  'sm.arbReadyHint': {
    en: 'Ready. Configure filters and start a scan.',
    'pt-BR': 'Pronto. Configure os filtros e inicie um scan.',
  },
  'sm.handoffHint': {
    en: 'Results show up in the CSFloat tab once analysis finishes.',
    'pt-BR': 'Os resultados aparecem na aba do CSFloat quando a análise termina.',
  },
  'sm.noCsrf': {
    en: 'No CSRF token detected — log in on SkinsMonkey and reload.',
    'pt-BR': 'Token CSRF não detectado — faça login no SkinsMonkey e recarregue.',
  },
  'sm.scanning': { en: 'Scanning SkinsMonkey…', 'pt-BR': 'Escaneando o SkinsMonkey…' },
  'sm.starting': { en: 'Starting scan…', 'pt-BR': 'Iniciando scan…' },
  'sm.collecting': { en: 'Collected {n}…', 'pt-BR': 'Coletados {n}…' },
  'sm.collectingInv': {
    en: 'Collecting SkinsMonkey inventory…',
    'pt-BR': 'Coletando inventário do SkinsMonkey…',
  },
  'sm.handingOff': {
    en: 'Collected {n} items. Handing off to CSFloat…',
    'pt-BR': 'Coletados {n} items. Enviando ao CSFloat…',
  },
  'sm.sending': {
    en: 'Sending {n} items to CSFloat analyzer…',
    'pt-BR': 'Enviando {n} items ao analisador do CSFloat…',
  },
  'sm.doneOpenTab': {
    en: 'Done. Open the CSFloat tab.',
    'pt-BR': 'Pronto. Abra a aba do CSFloat.',
  },
  'sm.sent': {
    en: 'Sent {n} items. Analysis runs in the CSFloat tab.',
    'pt-BR': 'Enviados {n} items. A análise roda na aba do CSFloat.',
  },
  'sm.handoffFail': { en: 'Failed to hand off: {err}', 'pt-BR': 'Falha ao enviar: {err}' },
  // ── CSFloat (arbitrage oracle) ─────────────────────────────────────
  'csf.waiting': {
    en: 'Waiting for items from SkinsMonkey…',
    'pt-BR': 'Aguardando items do SkinsMonkey…',
  },
  'csf.refresh': { en: 'Refresh', 'pt-BR': 'Atualizar' },
  'csf.rescan': { en: 'Rescan', 'pt-BR': 'Reescanear' },
  'csf.idleHint': {
    en: 'Run a scan on SkinsMonkey. The list will appear here automatically.',
    'pt-BR': 'Rode um scan no SkinsMonkey. A lista aparece aqui automaticamente.',
  },
  'csf.header.left': { en: 'Item · price · stickers', 'pt-BR': 'Item · preço · stickers' },
  'csf.profit': { en: 'Profit', 'pt-BR': 'Lucro' },
  'csf.analyzing': { en: 'Analyzing {done}/{total}…', 'pt-BR': 'Analisando {done}/{total}…' },
  'csf.analyzingN': { en: 'Analyzing {n} listings…', 'pt-BR': 'Analisando {n} listagens…' },
  'csf.complete': {
    en: 'Analysis complete — {n} listings.',
    'pt-BR': 'Análise completa — {n} listagens.',
  },
  'csf.stopped': { en: 'Analysis stopped.', 'pt-BR': 'Análise interrompida.' },
  'csf.empty.title': { en: 'No opportunities', 'pt-BR': 'Nenhuma oportunidade' },
  'csf.empty.sub': {
    en: 'Try widening the filters on SkinsMonkey and rescan.',
    'pt-BR': 'Amplie os filtros no SkinsMonkey e reescaneie.',
  },
  'csf.found': {
    en: 'Found {n} listings. {p} profitable.',
    'pt-BR': '{n} listagens. {p} lucrativas.',
  },
  'csf.open': { en: 'Open CSFloat ↗', 'pt-BR': 'Abrir CSFloat ↗' },
  'csf.meta.est': { en: '⚠ Est', 'pt-BR': '⚠ Est' },
  'csf.meta.stickers': { en: '{n} stickers', 'pt-BR': '{n} stickers' },
  'csf.meta.stickerGtSkin': { en: 'sticker > skin', 'pt-BR': 'sticker > skin' },
  'csf.meta.charmGtSkin': { en: 'charm > skin', 'pt-BR': 'charm > skin' },
  'csf.meta.lock': { en: '🔒 lock', 'pt-BR': '🔒 lock' },
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
