# Skinsight — Plano

> Single source of truth técnico: `C:\Users\Windows 11\Desktop\briefing-claude-code.md`.
> Roadmap de produto: `C:\Users\Windows 11\Desktop\plano-monetizar-jhony.md`.
> Mockup UI: `C:\Users\Windows 11\Desktop\mockup-ui-skinsight.html`.
> APIs e referências: `C:\Users\Windows 11\Desktop\pesquisa-apis-e-referencias.md`.
>
> Este arquivo se reescreve a cada fase. Hoje cobre **v0.1 em detalhe** e o resto em outline.

---

## Resumo do briefing (5 bullets — alinhamento confirmado)

- **Produto:** Skinsight — extensão MV3 Chrome/Firefox para CS2 skin traders. Tagline "See what others miss." Posicionamento: _opportunity scanner_ (ativo, varre, ranqueia), **não** decorator (passivo) como BetterFloat.
- **Fases v0.1/v0.2:** v0.1 é foundation técnica (repo + Vite/crxjs + TS strict + ESLint/Prettier + Vitest + CI verde + manifest com hosts exatos + popup vazio + LICENSE/README). v0.2 é o modo Arbitrage portado de `busca_pattern_cs2` (SM → service-worker → CSFloat, substituindo clipboard).
- **Stack:** TypeScript strict + Vite + `@crxjs/vite-plugin` + Vitest + ESLint/Prettier + GitHub Actions. Sem React, sem backend no v1. Tudo em `chrome.storage.local`.
- **Regra crítica #1:** **NÃO reescrever o algoritmo de score do arbitrage.** Migrar `builder.js`/`builder-csf.js` linha-por-linha. Refactor só depois de v1.0 com testes garantindo equivalência.
- **Hosts exatos do manifest (sem `<all_urls>`, sem `clipboardRead`/`Write`):** `skinsmonkey.com`, `csfloat.com`, `*.pirateswap.com`, `cs.money`, `steamcommunity.com`, `api.skinport.com`. Permissions: `["storage", "tabs"]`.

---

## Estado atual do repo (snapshot)

O scaffold inicial foi feito antes da chegada do briefing definitivo. O repo já contém:

```
skinsight/
├── PLAN.md                        # este arquivo
├── README.md                      # inicial
├── package.json                   # vite + crxjs + @types/chrome + typescript
├── tsconfig.json                  # strict
├── vite.config.ts
├── manifest.config.ts             # hosts: SM, CSFloat, PS, CSM, Steam — falta api.skinport.com
├── .gitignore
├── scripts/
│   ├── build-rare-data.mjs        # slim rare_stickers.json → public/
│   └── pack-zip.mjs               # dist/ → skinsight-<ver>.zip
└── src/
    ├── vite-env.d.ts
    ├── background/
    │   └── service-worker.ts      # message router + open CSFloat tab + hits
    ├── popup/
    │   ├── popup.html             # logo + #content slot
    │   └── popup.css              # tokens.css + mockup section 1 styles
    ├── modules/
    │   ├── shared/
    │   │   ├── tokens.ts          # OVERLAY_CSS (paleta + componentes da mockup)
    │   │   ├── overlay.ts         # OverlayShell (drag, minbar, persist position)
    │   │   ├── storage.ts         # Settings, hits, pending arbitrage payload
    │   │   ├── messaging.ts       # send/onMessage tipado
    │   │   ├── settings.ts        # cache + watch
    │   │   └── fmt.ts             # esc, safeUrl, fmtCents, sleep
    │   ├── arbitrage/
    │   │   ├── types.ts
    │   │   ├── score.ts           # portado VERBATIM de builder-csf.js
    │   │   ├── csf-url.ts         # DEF_INDEX + buildCsfUrl
    │   │   ├── scanner.ts         # fetchPage, applyFilter, buildExportPayload, steamPrice queue
    │   │   └── analyzer.ts        # fetchCsfPrice + runAnalysis
    │   └── rare/
    │       ├── types.ts
    │       ├── rare-data.ts       # load slim JSON via chrome.runtime.getURL
    │       ├── finder.ts          # SM + PS collect/normalize/filter
    │       └── csmoney.ts         # CS.Money collect + rare-DB regenerator
```

**Diagnóstico vs roadmap do briefing:**

| Componente                                      | Estado                                  | Fase declarada                      |
| ----------------------------------------------- | --------------------------------------- | ----------------------------------- |
| Scaffold (vite, crxjs, ts, manifest)            | ✅ existe                               | v0.1                                |
| ESLint + Prettier + EditorConfig                | ❌ falta                                | v0.1                                |
| Vitest + score.test.ts                          | ❌ falta                                | v0.1 (score.test.ts é gate p/ v0.2) |
| GitHub Actions CI                               | ❌ falta                                | v0.1                                |
| LICENSE + PRIVACY.md                            | ❌ falta                                | v0.1                                |
| `docs/{ARCHITECTURE,API-NOTES,CONTRIBUTING}.md` | ❌ falta                                | v0.1 skeleton                       |
| Popup vazio funcional                           | ⚠️ HTML + CSS prontos, `popup.ts` falta | v0.1                                |
| Stubs de content script nos 4 sites             | ❌ faltam                               | v0.1 (apenas `console.log`)         |
| `host_permissions` inclui api.skinport.com      | ❌ falta                                | v0.1                                |
| Logo `⌖` no popup                               | ⚠️ está "SH", precisa virar `⌖`         | v0.1                                |
| Módulos arbitrage portados                      | ✅ pronto, **fora de fase (v0.2)**      | v0.2 — fica dormente                |
| Módulos rare portados                           | ✅ pronto, **fora de fase (v0.3)**      | v0.3 — fica dormente                |
| Service worker message router                   | ✅ pronto, **fora de fase (v0.2)**      | v0.2 — fica dormente                |

Decisão: **os módulos portados ficam onde estão** (sem wire-up nos content scripts) até v0.2/v0.3. v0.1 fecha primeiro.

---

## v0.1 — Foundation (em curso)

**Objetivo:** repo profissional. Extensão vazia carrega no Chrome. CI verde. Build de prod zipa. Zero feature de produto.

### Passos restantes

1. **Manifest fix**
   - Adicionar `*://api.skinport.com/*` em `host_permissions`.
   - Confirmar `permissions: ["storage", "tabs"]` apenas.
2. **Popup vazio funcional (`src/popup/popup.ts`)**
   - Renderiza header (`⌖ Skinsight v0.1.0`), seções `Modes` (toggles inertes em v0.1, salvam em `chrome.storage.local`), `Sites` (status reading `chrome.tabs.query`), bloco `Today's hits` (vazio inicialmente), botões doação (Ko-fi + Pix copy).
   - Empty state quando aba ativa não é site suportado (mockup seção 4).
   - Sem lógica de scan (essa é v0.2/v0.3).
3. **Logo no popup**
   - Trocar "SH" por `⌖` (crosshair) — espelha mockup-ui-skinsight.html.
4. **Stubs de content scripts**
   - `src/content/{skinsmonkey,csfloat,pirateswap,csmoney}.ts` — cada um só faz `console.debug('[Skinsight] loaded on <site>')`. Confirma que o crxjs/MV3 entry está vivo.
5. **Lint + format**
   - ESLint flat config (`eslint.config.js`) com `@typescript-eslint`, `eslint-config-prettier`.
   - Prettier (`.prettierrc`).
   - `.editorconfig`.
   - Scripts: `npm run lint`, `npm run format`, `npm run format:check`.
6. **Testes**
   - Vitest config (`vitest.config.ts`).
   - `tests/modules/arbitrage.score.test.ts` — porta os 7 cases de `busca_pattern_cs2/tests/score.test.html`. Trava o algoritmo antes de qualquer refactor.
   - Smoke test `tests/smoke.test.ts` só pra garantir que Vitest roda.
7. **CI**
   - `.github/workflows/ci.yml`: matrix Node 20, steps `lint`, `typecheck`, `test`, `build`.
   - Verde em PRs e em push para `main`.
8. **Docs + legal**
   - `LICENSE`: MIT (decisão default; PolyForm fica para v1.0 se necessário).
   - `PRIVACY.md`: rascunho — "no data collected, all data in chrome.storage.local of user". Pra publicar no GitHub Pages na v1.0.
   - `docs/ARCHITECTURE.md`: skeleton, esp. data flow SM → SW → CSFloat (preenche em v0.2).
   - `docs/CONTRIBUTING.md`: setup, scripts, conventional commits.
   - `docs/API-NOTES.md`: caveats — CSRF SM, CORS Steam, Skinport brotli, rate limits.
9. **README atualizado**
   - Setup, scripts, sites cobertos, donate.

### Critérios de saída (v0.1)

- ✅ `npm install && npm run build` produz `dist/` carregável via _Load unpacked_ sem warnings de manifest.
- ✅ `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` — todos verdes.
- ✅ CI verde no PR de fechamento da v0.1.
- ✅ Popup abre. Em aba SM/CSFloat/PS/CSM mostra mockup completo. Em aba qualquer outra mostra empty state.
- ✅ `tests/modules/arbitrage.score.test.ts` passa todos os casos do legacy.
- ✅ `npm run pack` gera `skinsight-0.1.0.zip`.
- ✅ Tag local `v0.1.0` criada (push de tag remoto fica para quando houver remote).

---

## v0.2 — Modo Arbitrage (próximo)

Plano detalhado quando v0.1 fechar. Roteiro previsto:

- Wire `src/modules/arbitrage/*` (já portado) nos content scripts `skinsmonkey.ts` e `csfloat.ts`.
- UI overlay no SM com `FilterGrid` (min profit, max price, sort) + `ScanBar` + `ItemCard` (hot/warm/neutral).
- Comunicação SM → service worker → CSFloat substitui o clipboard.
- Persistir posição/minimize em `chrome.storage.local` por hostname.
- `docs/ARCHITECTURE.md` completo com diagrama do data flow.
- Fixtures reais (`tests/fixtures/`) + expansão de `arbitrage.score.test.ts`.

**Não fazer em v0.2:** Steam Market fetch (v0.4), Skinport oracle (v0.5), telegram/pro (v1.5).

---

## v0.3 — Modo Rare

Plano detalhado quando v0.2 fechar. Roteiro previsto:

- Wire `src/modules/rare/*` (já portado) nos content scripts `skinsmonkey.ts`, `pirateswap.ts`, `csmoney.ts`.
- Sticker breakdown no `ItemCard` (matte/foil/holo CSS).
- Toggle SM Arbitrage vs Rare resolve sem conflito (popup escolhe).
- Botão "Regenerate rare DB" no overlay CS.Money.
- `tests/modules/rare.finder.test.ts` com fixtures de cada site.

---

## v0.4–v0.6 — Steam, Skinport, Polish

Vide `plano-monetizar-jhony.md` §v0.4, v0.5, v0.6. Resumo:

- **v0.4:** Steam priceoverview com rate-limit guard no service worker (max 15 req/min, queue, backoff 429). Botão "Show Steam price" por item.
- **v0.5:** Skinport `/v1/items` cache 5min, oráculo local. Coluna no card.
- **v0.6:** ícones SVG profissionais, i18n PT-BR + EN, options page, onboarding, audit de memory leak, docs completas.

---

## v0.7 → v2.0

Vide briefing §8 + `plano-monetizar-jhony.md`. Beta privado → public launch → mais markets → FGE → csmoneycharms → Pro → Platform.

---

## Decisões fixadas até agora

| #   | Decisão                                                                          | Fonte                       |
| --- | -------------------------------------------------------------------------------- | --------------------------- |
| 1   | Nome: **Skinsight**                                                              | briefing §1                 |
| 2   | Stack: Vite + crxjs + TS strict + Vitest + ESLint/Prettier + GitHub Actions      | briefing §4                 |
| 3   | Sem backend no v1; tudo em `chrome.storage.local`                                | briefing §4                 |
| 4   | `host_permissions` exatos (vide briefing §7)                                     | briefing §7                 |
| 5   | Algoritmo de score migrado verbatim, não refactor                                | briefing §9 DON'T #1        |
| 6   | Clipboard substituído por `chrome.runtime.sendMessage`                           | briefing §9 DON'T #3        |
| 7   | Steam Market só on-demand (v0.4), não scan massivo                               | briefing §9 DON'T #4        |
| 8   | Skinport cache 5min hard (v0.5)                                                  | briefing §9 DON'T #5        |
| 9   | UI em inglês; mockup `mockup-ui-skinsight.html` é o alvo                         | briefing §10                |
| 10  | LICENSE = **PolyForm Noncommercial 1.0.0** (protege monetização v1.5)            | review override do reviewer |
| 11  | Ko-fi `https://ko-fi.com/sganzerla`; Pix `ac344236-c335-4f89-aee2-e671101d4619`  | confirmado pelo user        |
| 12  | Identidade real do autor **não** vai no listing público                          | briefing §11                |
| 13  | `tsconfig.json` com `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`    | review override             |
| 14  | ESLint `@typescript-eslint/no-explicit-any` como `error` (escape via comentário) | briefing §9 DO #8 + review  |
| 15  | `PRIVACY.md` é a versão final de `assets-lancamento.md` §3 (placeholder GitHub)  | review override             |

---

## v0.1 — checkpoint de saída

**Status:** v0.1 fechado. Todos os exit criteria verdes.

### Gates verificados (output local)

- `npm run lint` → 0 erros, 0 warnings
- `npm run typecheck` → 0 erros (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`)
- `npm run format:check` → "All matched files use Prettier code style!"
- `npm test` → 2 files / 10 tests passed (smoke 3 + score parity 7)
- `npm run build` → `dist/manifest.json` 2.7 KB com 10 host_permissions exatos, 4 content scripts, SW, popup
- `npm run pack` → `skinsight-0.1.0.zip` 32 KB

### `tests/modules/arbitrage.score.test.ts` — 7/7 parity com legacy

Cobre os mesmos cases de `busca_pattern_cs2/tests/score.test.html`: T1 lucro básico, T2 sticker > skin, T3 trade-lock × 0.5, T4 float < 0.01 × 1.3, T5 clamp em 0, T6 charm > skin, T7 estimated passa.

### Arquivos novos/atualizados nesta rodada

- `LICENSE` — PolyForm Noncommercial 1.0.0 (texto canônico)
- `PRIVACY.md` — versão pronta do `assets-lancamento.md` §3 (placeholder `[YOUR_HANDLE]`)
- `tsconfig.json` — `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` ligados
- `eslint.config.js` — `@typescript-eslint/no-explicit-any: 'error'` (já estava)
- `manifest.config.ts` — `api.skinport.com` adicionado, ícones removidos para v0.6
- `src/popup/{popup.html,popup.ts,popup.css}` — popup completo (modes, sites, hits, Ko-fi, Copy Pix, empty state)
- `src/content/{skinsmonkey,csfloat,pirateswap,csmoney}.ts` — stubs `console.debug`
- `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `vitest.config.ts`, `eslint.config.js`
- `tests/{smoke.test.ts,modules/arbitrage.score.test.ts}`
- `.github/workflows/ci.yml`
- `docs/{ARCHITECTURE,API-NOTES,CONTRIBUTING}.md`
- `README.md` atualizado (PolyForm, scripts completos, sites table com fase)

### TODOs em aberto (não bloqueiam v0.2)

- Conta GitHub remota / push do repo / tag `v0.1.0` push remoto.
- Pseudônimo para Chrome Web Store (diferido para v0.7/v1.0 per reviewer).
- Ícones PNG 16/32/48/128 (v0.6).
- Substituir `[YOUR_HANDLE]` em `PRIVACY.md` quando o GitHub for definido.
- Atualizar `docs/ARCHITECTURE.md` quando v0.2 wire-up acontecer (substitui "v0.2 design, not yet wired" pelo real).

### v0.1 aprovado pelo reviewer. Fix obrigatório aplicado em `60c08cc`.

---

## v0.2 — Modo Arbitrage ✅ aprovado (tag local `v0.2.0`)

**Resumo:** SkinsMonkey scanner → service worker → CSFloat analyzer wired end-to-end. Clipboard hand-off do legacy substituído por `chrome.runtime.sendMessage` com payload persistido no `chrome.storage.local` (TTL 30 min). Score migrado verbatim, 7 cases de parity passando. Smoke manual (Jhony) confirmou lista de oportunidades aparecendo no overlay do CSFloat. Post-smoke: `fix(manifest)` expôs chunks do crxjs no WAR (commit `f50534c`); `perf(arbitrage)` adicionou throttle 350 ms entre requests pra evitar 429 (`cba4d8d`).

Detalhe histórico desta fase preservado abaixo para auditoria.

### Commits (v0.1 baseline → HEAD)

```
a1e660b docs(architecture): document SM → SW → CSFloat data flow with mermaid
4883dab style: apply prettier formatting to v0.2 sources
1e6f99a test(arbitrage): add SM + CSFloat fixtures and end-to-end parity test
874311c feat(arbitrage): wire analyzer into CSFloat content script
186eb97 feat(arbitrage): wire scanner into SkinsMonkey content script
069ee56 refactor(messaging): switch arbitrage flow to start/ready/payload/result taxonomy
c5e4be0 feat(shared): add UI primitives — FilterGrid, ScanBar, ItemCard, StickerChip
60c08cc fix(manifest): narrow web_accessible_resources to supported hosts
```

8 commits, Conventional Commits style, todos por unidade lógica conforme o exemplo do reviewer.

### O que foi entregue

- **`src/modules/shared/ui.ts`** — primitives `renderFilterGrid`, `renderScanBar` + `updateScanBar`, `renderItemCard` com variantes `hot|warm|neutral`, `renderStickerChip` (matte/foil/holo), `variantByProfitPct`, `variantByRoi`, `renderBanner`. Pure HTML builders.
- **`src/modules/shared/messaging.ts`** — taxonomy `arbitrage:start | :ready | :payload | :result` + `hit:record`. Helper `hitRowFromAnalysisRow`. `sendToTab` para SW.
- **`src/background/service-worker.ts`** — router completo: persiste payload com TTL 30 min, abre/foca tab CSFloat, encaminha payload no `:ready`, agrega hits no `:result`.
- **`src/content/skinsmonkey.ts`** — overlay com FilterGrid (search, max pages, exteriors preset) + ScanBar com progresso live + AbortController. Mount/unmount reativos a `watchSettings`.
- **`src/content/csfloat.ts`** — overlay com idle/running/done states. `analyzer.runAnalysis` com `isAborted`. `ItemCard` por linha com meta chips (SM/CSF prices, estimated, lock, sticker/charm flags) + Open CSFloat ↗ via `buildCsfUrl`. Reporta `arbitrage:result` ao final.
- **`docs/ARCHITECTURE.md`** — mermaid sequenceDiagram do fluxo real + tabela de message taxonomy + tabela de edge cases.
- **`tests/fixtures/{skinsmonkey-page,csfloat-response}.json`** + **`tests/modules/arbitrage.parity.test.ts`** — 4 cases validando schema mapping e cálculos de score com fixtures sanitizadas.

### Edge cases endereçados em código

Vide `docs/ARCHITECTURE.md` §"Edge cases". Os 4 cenários do reviewer (sem CSRF, CSF em página errada, 429 no SM, tab CSF fechada mid-scan) estão tratados — sem CSRF mostra mensagem clara, 429 retenta 3× com backoff 600 ms, fechar tab faz o TTL de 30 min cobrir.

### Gates v0.2

- `npm run lint` → 0 issues
- `npm run typecheck` → 0 erros
- `npm run format:check` → clean
- `npm test` → 3 files / 14 tests passed (smoke 3 + score 7 + parity 4)
- `npm run build` → dist OK
- `npm run pack` → `skinsight-0.1.0.zip` regenerado

### Limitação intencional

Steam Market price fetch fica desabilitado no `scanner.ts` v0.2 (`steamPrice()`/`fetchAccessoryPrices()` existem mas o content script não as chama). Habilita em v0.4 via service worker com rate-limit guard (briefing §7 + §9 DON'T #4).

### Não foi feito (escopo correto v0.2)

- Steam priceoverview (v0.4)
- Skinport oracle (v0.5)
- Modo Rare wire-up (v0.3)
- Refactor do algoritmo de score (até v1.0+)

### TODOs persistentes

- Conta GitHub remota / push / tags
- Substituir `[YOUR_HANDLE]` em `PRIVACY.md`
- Pseudônimo Chrome Web Store (v0.7/v1.0)
- Ícones PNG 16/32/48/128 (v0.6)
- Teste manual end-to-end com usuário logado em SM (impossível de automatizar no ambiente atual)

### Aguardando aprovação para iniciar v0.3 (Modo Rare). ✅ aprovado

---

## v0.3 — Modo Rare (em curso)

**Status:** wire-up completo nos 3 sites + mutex de modo. Gates locais verdes. Aguardando smoke manual nos 3 sites para fechar.

### Commits desde `v0.2.0`

```
f748d83 test(rare): add fixtures and parity tests for 3 sites
e920702 feat(rare): branch SkinsMonkey content script by activeMode
aae5033 feat(rare): wire CS.Money content script with Regenerate-DB drawer
6fea9e3 feat(rare): wire PirateSwap content script (rare mode)
f612e2f feat(rare): add ItemCard renderer with sticker-breakdown chips
4549645 refactor(settings): replace 4-boolean modes with mutex activeMode
cba4d8d perf(arbitrage): throttle CSFloat requests to avoid 429       (post-v0.2.0)
f50534c fix(manifest): expose content-script chunks via web_accessible_resources  (post-v0.2.0)
```

### O que foi entregue

- **Mutex de modos:** `Settings.modes{…}` (4 booleans) substituído por `Settings.activeMode: 'arbitrage' | 'rare' | null`. Migração transparente para usuários que já tinham settings v0.2 salvos. Popup renderiza 2 cards mas só um active a cada vez; clicar no active desliga ambos. Sites desabilitam visualmente o modo que não suportam (opacity .45 no `mode-card`).
- **`src/modules/rare/render.ts`** — adapter `renderRareCard(RareResult)` + `renderCsMoneyCard(CsMoneyItem)`. `classifyStickerKind()` infere `matte/foil/holo/gold/lenticular` por regex no nome.
- **`src/content/pirateswap.ts`** — overlay completo Rare. Filtros: pages, max price, sort. `collectAll(site:'pirateswap')` → `findRareResults` → `applyRareFilter` → `renderRareCard`. Reporta top hit via `hit:record`.
- **`src/content/csmoney.ts`** — overlay Rare + `<details>` drawer "Rare-DB maintenance" com botão Regenerate. Filtros: pages, delayMs, sort (4 opções). `collectCsMoney` direto → `renderCsMoneyCard`. Regenerate constrói `buildRareReport` e baixa via Blob+a[download]. Bundle não é substituído em runtime — maintainer revisa antes de release.
- **`src/content/skinsmonkey.ts`** — dual-mode branch. Estado independente por modo (`arbState`, `rareState`) para evitar corrupção mid-scan quando o user flippa o mutex. Posição do overlay persiste separadamente por modo (`skinsmonkey-arb` / `skinsmonkey-rare`).
- **`docs/ARCHITECTURE.md`** — mermaid novo para Rare flow + sub-diagrama para Regenerate. Tabela de edge cases estendida.
- **Tests:** `tests/fixtures/{pirateswap,csmoney}-page.json` + `tests/modules/rare.finder.test.ts` com 13 cases cobrindo normalizadores, match+ROI, threshold edge, filter+sort, rare-report schema completo, classifyStickerKind.

### Gates v0.3

- `npm run lint` → 0 issues
- `npm run typecheck` → 0 erros (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes)
- `npm run format:check` → clean
- `npm test` → 4 files / 27 tests (smoke 3 + score 7 + arb parity 4 + rare 13)
- `npm run build` → dist OK
- `npm run pack` → zip OK

### Edge cases tratados

Vide `docs/ARCHITECTURE.md` §"Edge cases" atualizado:

- User flippa popup mid-scan → overlay antigo aborta, novo monta limpo
- Regenerate sem coleta → botão disabled
- PS visitado com Arbitrage ON → overlay não monta
- Rare DB load fail → erro no overlay status

### Não foi feito (escopo correto v0.3)

- Steam priceoverview (v0.4)
- Skinport oracle (v0.5)
- Telegram/Pro (v1.5)
- Refactor do algoritmo de score / finder (verbatim mantido)
- i18n (v0.6)

### TODOs persistentes

- Conta GitHub / push / tags remotas
- Substituir `[YOUR_HANDLE]` em `PRIVACY.md`
- Pseudônimo Chrome Web Store (v0.7/v1.0)
- Ícones PNG 16/32/48/128 (v0.6)
- Smoke manual Jhony nos 3 sites para fechar v0.3

### v0.3 aprovada pelo reviewer · tag local `v0.3.0` criada · smoke do Jhony confirmou os 3 sites + não-regressão Arbitrage.

---

## v0.4 — Bug fixes + Rare-first repositioning (em curso, aguardando smoke)

**Status:** wiring completo. Gates locais verdes. Aguardando smoke do Jhony.

> O Steam Market foi adiado para v0.5 e o Skinport para v0.6. Renumeração refletida em `plano-monetizar-jhony.md`. Razão: o smoke da v0.3 revelou bugs e questões de posicionamento que não dava pra adiar até v0.7.

### Commits desde `v0.3.0`

```
45d7e93 feat(rare): 4 sticker tiers — Paper/Holo/Foil/Gold with corrected foil
948bb4e feat(popup): rare-first repositioning — tagline, default mode, card order
8fb3b48 refactor(settings): per-site mutex via skinsmonkeyMode + always-on others
5060f26 feat(rare): render real sticker images in chips with gradient fallback
7bebce7 fix(rare/csmoney): extract weapon image from item.img with fallback chain
64294fa feat(storage): 24h sliding TTL for Today's hits + SW garbage collection
5cdd306 perf(arbitrage): SW-side token-bucket gate for CSFloat (45/min + 30s 429 pause)
068a460 fix(rare/pirateswap): raise max-pages default to 50 with select preset
```

8 commits Conventional, um por unidade lógica.

### O que foi entregue

**Fase B — bugs:**

- `B2 fix(rare/pirateswap)`: filtro "Max pages" trocado de input number default=5 para `<select>` com presets `[10, 25, 50, 100, 200]`, default 50 (= 2000 itens, equivalente ao SAFETY_CAP legacy). Tooltip via `FilterField.hint`.
- `B3 perf(arbitrage)`: token bucket no SW (45 req/min, burst 10) substitui o sleep 350 ms por-item; `csf:request-slot` + `csf:got-429` (pause 30s). Test cobre 5 cenários com fake timers.
- `B4 feat(storage)`: TTL 24h sliding nos hits (era midnight cutoff), `runHitsGc()` na inicialização do SW. `filterHits` puro exportado pra teste.
- `B1 fix(rare/csmoney)`: `extractCsMoneyImageUrl(item)` com fallback chain `img → steamImg → preview → screenshot`. `CsMoneyItem.imageUrl: string | null`. Fixture trocada pelo HAR real (10 items). Render do card usa `<img>` + onerror + `.sh-item-thumb-fallback` (placeholder ⌖ atrás do gradiente).
- `B1.2 feat(rare)`: chips de sticker passam a renderizar a imagem real (Steam icons CDN) dentro do gradiente circular. Onerror cai pro gradiente classificado por tier.

**Fase C — mutex per-site:**

- `Settings.activeMode` (global) → `Settings.skinsmonkeyMode: 'arbitrage' | 'rare'` (default `'rare'`). Migrações de v0.2 (`modes.*`) e v0.3 (`activeMode`).
- PS / CS.Money / CSFloat removeram `watchSettings`/`isModeActive` — montam **always-on** no carregamento. Scan rodando nessas abas sobrevive a qualquer toggle no popup.
- Popup ganha section "SkinsMonkey mode" (só relevante quando aba ativa é SM, escurece nos outros sites) + sub-label "Always-on Rare/Arbitrage oracle/Mode toggle above" em cada site row.

**Fase D — Rare-first repositioning:**

- Default `skinsmonkeyMode='rare'` (era 'arbitrage' na v0.3).
- Card Rare renderizado **acima** do Arbitrage no popup.
- Tagline curta no header: "Rare sticker scanner for CS2 skin trading."
- README primeira frase reescrita: "Skinsight is a CS2 **rare sticker scanner** that catches items where the stickers are worth more than the listing price. It also does cross-site price **arbitrage** as a secondary feature." Sites table reordenada (Rare antes de Arbitrage).
- `mockup-ui-skinsight.html` no Desktop atualizado in-place: tagline no header + ordem dos cards + section label.

**Fase E — 4 tiers de sticker:**

- `StickerKind` ganha `'gold'` e `'paper'` (alias de `matte`). 4 tiers reais: Paper (indigo, default) / Holo (rainbow conic) / Foil (silver `#e4e4e7 → #a1a1aa` — corrigido de gold) / Gold (`#facc15 → #d4af37`, novo).
- `classifyStickerKind`: `(Holo)|(Lenticular)` → holo, `(Foil)` → foil, `(Gold)|(Champion)` → gold, default → paper.
- Mockup §3 mostra 1 chip por tier.

### Gates v0.4

- `npm run lint` → 0 issues
- `npm run typecheck` → 0 errors
- `npm run format:check` → clean
- `npm test` → **8 files / 54 tests** (smoke 3, score 7, arb parity 4, rare 19, throttle 5, sticker-chip 6, settings mutex 6, hits 4)
- `npm run build` → dist OK
- `npm run pack` → zip OK

### Não foi feito (escopo correto v0.4)

- Steam priceoverview integration (v0.5)
- Skinport oracle (v0.6)
- i18n / options / icons / onboarding (v0.7)
- Refactor de score / finder (verbatim mantido)

### TODOs persistentes

- Smoke manual do Jhony (cenários abaixo)
- Conta GitHub remota / push / tags
- `[YOUR_HANDLE]` em PRIVACY.md
- Pseudônimo Chrome Web Store (v0.8/v1.0)
- Ícones PNG 16/32/48/128 (v0.7)

### Smoke v0.4 — cenários novos a confirmar

1. **CS.Money image:** abrir cs.money, Scan, confirmar cards mostrando weapon image real (não emoji ⌖).
2. **PS pagination:** abrir pirateswap.com, Scan com default (50 pages), confirmar volume razoável (~ algumas centenas a 2000 items, função do inventário).
3. **CSFloat throttle:** Arbitrage scan SM → CSFloat com 100+ items. Esperado: cadence visivelmente mais lenta (~1.3s/item após burst inicial), **sem** 429 ou só raros pontuais (com pause de 30s automática).
4. **Mutex per-site:** abrir scan no PS, abrir popup, mudar SkinsMonkey mode de Rare → Arbitrage. Scan PS continua rolando intacto.
5. **Sticker tiers:** confirmar visualmente que foil = silver, gold = dourado (não trocados). Verificar com Sticker | kennyS (Foil) (silver) vs ESPADA (Gold) (dourado) no fixture HAR.
6. **Cards CSM com sticker images:** chips dos stickers mostram a foto real da Steam (não placeholder).
7. **Não-regressão:** smoke v0.2 e v0.3 ainda funcionam (SM Rare default, troca para Arbitrage, scan completo).

### Aguardando smoke do Jhony para tagear `v0.4.0` e iniciar v0.5 (Steam Market on-demand).

---

## Em aberto (perguntar quando necessário)

- Conta GitHub do projeto (precisa de um nome de org/user para push de tag e CI). Default por enquanto: configurar local; remote fica para usuário definir.
- Pseudônimo para Chrome Web Store (briefing §11 alerta sobre brand isolation). Não bloqueia v0.1.
- Ícones SVG profissionais — placeholder em v0.1, profissional em v0.6.
