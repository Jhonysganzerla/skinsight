# Skinsight — Plano

> Roadmap de funcionalidades (análise de produto): [`docs/ROADMAP-IDEIAS.md`](./docs/ROADMAP-IDEIAS.md).
> Arquitetura: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) · APIs: [`docs/API-NOTES.md`](./docs/API-NOTES.md) · Smoke: [`docs/SMOKE.md`](./docs/SMOKE.md).
>
> Este arquivo se reescreve a cada fase. Hoje cobre **v0.10 (fechada)** e o plano da **v0.11** em detalhe.

---

## Ritual de versão (OBRIGATÓRIO)

O manifest puxa `pkg.version` do `package.json`. **Ao fechar uma fase:** fecha o
trabalho → **bump do `package.json` no MESMO commit que será tagueado** →
commit → `git tag vX.Y.Z` → push (main + tag). Assim `manifest.version === tag`
sempre. A versão **nunca regride nem repete** (regra dura da Chrome Web Store).

Histórico do problema: tags `v0.2.0`…`v0.6.1` saíram com `package.json` em
`0.1.0`; corrigido na v0.6.1. Commits "v0.9.1/v0.9.2" saíram sem bump — por
isso a fase seguinte pulou direto para **v0.10.0**.

---

## Estado atual — v0.10.0 (fechada)

Tudo da v0.1 → v0.9 está entregue e estável: scaffold + CI, arbitragem
SM→CSFloat (score portado verbatim, paridade testada), Rare stickers nos 3
sites, Rare patterns query-by-name (50 skins, banco remoto via GitHub TTL 24h),
oráculo Steam per-item, i18n EN/PT-BR, welcome/options, overlay
chunked/virtualizado.

### v0.9.x hardening (pós-review de analista — ver ANALISE-MELHORIAS.md)

- 3 fixes críticos: GC do cache `steam_price:*`; renderChunked no CSFloat;
  gate de throttle fail-closed quando o SW morre durante 429.
- `scan-controller.ts`: plumbing Rare compartilhado (−370 linhas duplicadas);
  virtual list chegou ao SkinsMonkey.
- `use_dynamic_url` REMOVIDO de todas as WAR entries (crxjs beta hardcodeia;
  o GUID dinâmico invalidava e matava todos os content scripts —
  `chrome-extension://invalid`). `npm run build` roda `scripts/fix-manifest.mjs`.
- fetchWithTimeout nos collectors paginados; getCsrf memoizado; posição do
  overlay em chave própria `overlay_state`.
- Visual "Aurora" refinado + a11y (focus rings, prefers-reduced-motion).
- AWP | PAW reconstruída por consenso de 3 fontes, formato tiers T1/T2.

### v0.10 — Scan memory ("memória")

- **Diff/seen-set** (`shared/scan-memory.ts`): selo NOVO nos cards + filtro
  "Exibir: Só novos"; primeiro scan é baseline silencioso; cap 5k chaves.
- **Snapshot**: último scan de stickers persiste (cap 500, TTL 24h); banner
  "Restaurar" no mount do overlay.
- **Export CSV** (`shared/export.ts`): botão ⤓ CSV no header de resultados e
  no toolbar de patterns; exporta o conjunto filtrado/ordenado corrente.
- GC de snapshots no SW; +15 testes (250 total).

---

## v0.11 — Watchlist + Sentinela (próxima fase)

**Objetivo:** o Skinsight deixa de só _encontrar_ e passa a _vigiar_. O usuário
marca alvos; o service worker varre o PirateSwap em background e notifica hits
novos. É a feature de retenção (ROADMAP H2.1) e a base de qualquer tier Pro
futuro — que está **fora de escopo por ora** (sem contas, sem backend).

**Por que PirateSwap:** endpoint público sem auth (`credentials:'omit'` já é a
regra), com filtro server-side por seed/fade (`collectPsByName` +
`psResolveHashCodes` prontos). CS.Money (Cloudflare) e SkinsMonkey (CSRF de
página) ficam FORA do background.

### Passos

1. **Permissões** — adicionar `alarms` + `notifications` ao manifest numa única
   release; justificativa explícita no listing e no PRIVACY.md ("alertas locais
   de itens que VOCÊ marcou; nada sai do seu navegador").
2. **Modelo** — `watchlist` em storage: alvos = skin do banco de patterns
   (nome) OU regra de sticker ("ROI ≥ X e preço ≤ Y"). Cap ~10 alvos.
3. **UI** — seção no popup (marcar/desmarcar a partir do banco de patterns) +
   estrela nos cards de resultado para "vigiar este skin".
4. **Runner no SW** — `chrome.alarms` (15–30 min, jitter): rodada enxuta SÓ dos
   alvos (máx ~20 requests), diff via seen-set existente (`flagNew` com scope
   `sentinel:<alvo>`), auto-desliga após N falhas consecutivas.
5. **Notificação** — `chrome.notifications.create` com nome, seed/ROI e clique
   abrindo o `siteSearchUrl`. Limiar configurável nas options.
6. **Histórico leve** — amostrar preço por rodada (~30 pontos por alvo) para
   um sparkline futuro; cap duro de storage.
7. **Gates + smoke** — testes do runner (stub de chrome.alarms), SMOKE.md
   ganha seção de sentinela; re-review CWS documentada.

### Riscos

- **Rate/ToS:** orçamento ridículo por rodada, jitter, kill-switch remoto via
  flag no `rare_patterns.json` (desativar a sentinela sem release).
- **MV3:** alarms ≥ 1 min ok; estado todo em storage (arquitetura já é assim);
  SW acorda por alarm.
- **CWS:** permissões novas = re-review. Uma vez só, bem documentada.

---

## Backlog (depois da v0.11 — ver ROADMAP-IDEIAS.md)

- H1.4 filtros min ROI / float máx (expor o que `applyRareFilter` já aceita).
- H2.2 interceptação passiva de tráfego (PoC CS.Money, world:MAIN).
- H2.4 notificação de fim de scan (se a sentinela atrasar, sai antes).
- H2.5 CI cron re-precificando `rare_stickers.json`.
- H3.4 CSFloat como superfície de Pattern (API oficial com key).
- Adiado por decisão do maintainer: Doppler/facas CH, contas/Pro, Telegram.

## Não fazer (decidido)

- Backend/contas antes de demanda comprovada — mata o claim "no backend".
- Scan massivo via Steam Market (15 req/min; risco de ban de IP).
- Auto-compra/sniper com ação automatizada (ToS + política CWS).
- Skinport / Buff163 (muros comprovados — lição da v0.6 paga).
- Refactor do score de arbitragem (Regra crítica #1: paridade com o legacy).
