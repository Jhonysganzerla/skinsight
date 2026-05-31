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

Vide briefing §8 + `plano-monetizar-jhony.md`. Beta privado → public launch → mais markets → csmoneycharms → Pro → Platform.

---

## Decisões fixadas até agora

| #   | Decisão                                                                                                                                                                                                                          | Fonte                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1   | Nome: **Skinsight**                                                                                                                                                                                                              | briefing §1                 |
| 2   | Stack: Vite + crxjs + TS strict + Vitest + ESLint/Prettier + GitHub Actions                                                                                                                                                      | briefing §4                 |
| 3   | Sem backend no v1; tudo em `chrome.storage.local`                                                                                                                                                                                | briefing §4                 |
| 4   | `host_permissions` exatos (vide briefing §7)                                                                                                                                                                                     | briefing §7                 |
| 5   | Algoritmo de score migrado verbatim, não refactor                                                                                                                                                                                | briefing §9 DON'T #1        |
| 6   | Clipboard substituído por `chrome.runtime.sendMessage`                                                                                                                                                                           | briefing §9 DON'T #3        |
| 7   | Steam Market só on-demand (v0.4), não scan massivo                                                                                                                                                                               | briefing §9 DON'T #4        |
| 8   | Skinport cache 5min hard (v0.5)                                                                                                                                                                                                  | briefing §9 DON'T #5        |
| 9   | UI em inglês; mockup `mockup-ui-skinsight.html` é o alvo                                                                                                                                                                         | briefing §10                |
| 10  | LICENSE = **PolyForm Noncommercial 1.0.0** (protege monetização v1.5)                                                                                                                                                            | review override do reviewer |
| 11  | Ko-fi `https://ko-fi.com/sganzerla`; Pix `ac344236-c335-4f89-aee2-e671101d4619`                                                                                                                                                  | confirmado pelo user        |
| 12  | Identidade real do autor **não** vai no listing público                                                                                                                                                                          | briefing §11                |
| 13  | `tsconfig.json` com `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`                                                                                                                                                    | review override             |
| 14  | ESLint `@typescript-eslint/no-explicit-any` como `error` (escape via comentário)                                                                                                                                                 | briefing §9 DO #8 + review  |
| 15  | `PRIVACY.md` é a versão final de `assets-lancamento.md` §3 (placeholder GitHub)                                                                                                                                                  | review override             |
| 16  | **Filter freeze → virtualização (F4)**. F1+F2+F3 (memoize + chunk + chunked render + reactive filters) não bastou em smoke real; v0.4.1 vai pra IntersectionObserver-based virtualization                                        | reviewer pós smoke v0.4.1   |
| 17  | **`rare_stickers.json` regenerated via CS.Money** com `hasRareStickers=true` como oráculo canônico de "raro". O endpoint `cs.money/5.0/load_bots_inventory/730?hasRareStickers=true` define o universo; nosso bundle deriva dele | reviewer pós B5 do v0.4.1   |
| 18  | GitHub handle real: **`jhonysganzerla`** (display: `Jhonysganzerla`). Repo: `github.com/Jhonysganzerla/skinsight` (público). Web Store pseudônimo: `Sganzerla` (display)                                                         | reviewer + gh status        |

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

### v0.4 aprovada · tag local `v0.4.0` criada (no remoto também — push `gh repo create` + `git push`).

---

## v0.4.1 — Bug fixes pós-smoke + perf + repo público + remote-rares (✅ SMOKE OK · tag `v0.4.1`)

**Status:** ✅ **Smoke do Jhony passou nos 3 sites (PS + CS.Money + SkinsMonkey) + Arbitrage (CSFloat). Tag `v0.4.1` criada.** B1–B4 entregues; Issue 1 (filter freeze) **resolvido** via virtualização real (F4 / T1 — IntersectionObserver windowing, `97bb7ae`); Issue 2 (PS scan-to-empty) ✓; Issue 3 (GitHub remote) ✓. Pós-smoke veio uma rodada grande (ver "checkpoint final" no fim deste arquivo): pipeline remote-rares + gerador Python + piso $1.00 + filtros reativos em todos os sites + correções de scan do PirateSwap (throttle/DESC/hang). Gates verdes (typecheck/lint/85 tests/build/pack).

> ⚠️ Notas abaixo (B1–T4) preservam o estado _pré_-smoke para histórico. Alguns números ficaram desatualizados (ex.: piso $0.50 → **$1.00**; `itemWithSticker` foi **restaurado** depois; yields de match agora são **por tempo**, não por contagem). O estado autoritativo é o **checkpoint final** no fim do arquivo.

### Commits desde `v0.4.0` (10)

```
d257719 chore(repo): point public URLs at github.com/jhonysganzerla/skinsight
49937e0 fix(rare/pirateswap): scan to inventory end instead of page cap
e57690c chore(perf): instrument PS filter→render path with dev marks
1aa6a96 style: prettier on B1+B3 additions
f054664 chore(brand): apply Sganzerla pseudonym to public-facing strings
174a43c feat(icon): rasterize SVG → PNG, wire manifest + popup logo
e117963 chore(plan): drop FGE/FireGames out-of-scope references
125cfdb perf(rare): chunked DOM render + reactive filters in PirateSwap overlay
e7339a6 perf(rare): chunk findRareResults — yield to main thread every 100 items
e6b9951 perf(rare): memoize norm() sticker-name normalizer
```

### B1 — Perf (F1+F2+F3 entregues; F4 pendente)

| Sub  | Commit    | O que ficou                                                                                                                                                                            |
| ---- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1.a | `e6b9951` | `norm()` memoized em `rare-data.ts`. Spy prova ≤60 regex calls em 10000 invocações.                                                                                                    |
| B1.b | `e7339a6` | `findRareResults` cede main thread a cada 100 items. Tests cobrem yields≥19 em 2000 e =0 em 30.                                                                                        |
| B1.c | `125cfdb` | `renderChunked()` em `shared/ui.ts`: 50-item batches via `requestIdleCallback` + fallback `setTimeout(0)`. Range.createContextualFragment delta-parse. abort() flag em chunk boundary. |
| B1.d | `125cfdb` | PS overlay: input debounce 250ms, change instant; `state.results` em memória, filtro re-aplica + re-renderiza; abort do render em curso.                                               |

### Issue 1 — Filter freeze ✅ RESOLVIDO via virtualização real (T1 / `97bb7ae`)

**Fechamento (T1):** `src/modules/shared/virtual-list.ts` novo — windowing real com `computeWindow` (math puro, testável sem jsdom) + `renderVirtualList` (padTop/window/padBottom + IntersectionObserver + scroll rAF-throttled). PS usa quando `filtered.length > VIRT_THRESHOLD` (200); abaixo disso mantém `renderChunked`. Só ~17–30 cards no DOM independente de N (testado com 6000 items). Filtro reseta `scrollTop=0`. 8 tests cobrem o math + contrato DOM (fake-DOM stub, sem jsdom). Resolve a raiz das suspeitas c4/c5 (image decode + GPU layers) — os cards off-window simplesmente não existem.

Diagnóstico original (mantido para histórico):

Investigação read-only + instrumentation em `e57690c` (DEV-only `performance.mark`/`measure` em `applyAndRender` + cada chunk de `renderChunked`). Diagnóstico do code-review:

| Suspeito                            | Veredito                                                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| c1 cancelamento quebrado            | parcial — flag só checada em chunk boundary; chunk em curso completa (~1 chunk de trabalho desperdiçado, latência detectável) |
| c2 debounce sync                    | NÃO — handler trivial                                                                                                         |
| c3 rIC callbacks ainda disparam     | confirmado mas inofensivo (1 function call + early return)                                                                    |
| c4 image decode síncrono            | **MUITO PROVÁVEL** — `loading="lazy"` defere fetch mas decode é eager no scroll. 600 cards × ~2 stickers = ~1800 `<img>`.     |
| c5 conic-gradient GPU layer blow-up | possível — ~1200 mini-elementos com gradient promovem layers extras                                                           |

**Decisão #16:** v0.4.1 vai direto pra **virtualização (F4)** que antes tinha sido adiada. Fix incremental (chunkSize menor, IntersectionObserver pra imagens) não é suficiente — o reviewer cobrou a opção mais robusta. Plano de F4 no NEXT UP abaixo.

### Issue 2 — PS scan-to-empty ✓ entregue (`49937e0`)

- `PS_SAFETY_CAP_PAGES = 250` (10k items, dobro da estimativa máxima).
- Trust `empty:true` server-flag. `totalResults`/`totalPages` lidos em DEV mas ignorados (sempre 0 nas capturas).
- 250ms entre páginas (antes 400ms).
- "Max pages" filter removido da UI; ScanBar indeterminate.
- 5 tests cobrem: small inventory + trailing partial batch + safety cap + abort mid-scan + transient fetch error.

### Issue 3 — GitHub remote ✓ completo

- Repo criado: `https://github.com/Jhonysganzerla/skinsight` (público).
- `origin` configurado, `main` pushed.
- Tags pushed: `v0.2.0`, `v0.3.0`, `v0.4.0`. **`v0.1.0` nunca foi criada localmente** — v0.1 não chegou a ser tagueada (decisão histórica do reviewer; v0.1 fechou direto sem tag separada, foi absorvida pelo trabalho de v0.2).
- LICENSE, PRIVACY.md, popup.ts, package.json (`homepage`/`repository`/`bugs`) com URLs reais apontando pro repo.
- Token gh ganhou scope `workflow` (necessário pra `.github/workflows/ci.yml`).

### Gates v0.4.1 (parciais — pré-F4)

- `npm run lint` → 0
- `npm run typecheck` → 0
- `npm run format:check` → clean
- `npm test` → 11 files / **68 tests** (smoke 3, score 7, arb parity 4, rare finder 21, PS-scan 5, throttle 5, sticker-chip 6, settings mutex 6, hits 4, norm 3, renderChunked 4)
- `npm run build` → dist OK, ícones PNG presentes, manifest com `icons`+`action.default_icon`
- `npm run pack` → `skinsight-0.1.0.zip` (~124 KB)

---

## APIs descobertas (referência rápida — atualizar `docs/API-NOTES.md` na próxima rodada)

### PirateSwap `/inventory/v2/ExchangerInventory`

- **`totalResults` e `totalPages` sempre `0`** nas capturas. Não confiar.
- **`itemWithSticker=true` é no-op server-side** (não filtra). Param morto — pode ser removido (Plano A do NEXT UP).
- **`sortOrder=ASC`/`DESC` funcionam** corretamente sobre `orderBy=price`.
- **`empty:true`** é a sinalização canônica de fim de inventário; aparece em última página com items E em página trailer vazia.
- **Curva de preço fortemente caudada:** $0.15 nos primeiros 100 pages (ASC), $17k+ nas últimas. Inventário total ~4000–8000 items.
- **Sem rate limit observado** com 250ms entre páginas (250 pages cap = ~63s).

### CS.Money `/5.0/load_bots_inventory/730`

- **Weapon image:** `item.img` é o campo correto (URL Steam economy CDN). Fallback chain: `img → steamImg → preview → screenshot`.
- **Sticker image:** `item.stickers[i].img` (Steam icons CDN, PNG).
- **`hasRareStickers=true`** é a definição **canônica** de "raro" segundo o próprio CS.Money. Decisão #17: usar como oráculo do `rare_stickers.json`.
- `stickers` array tem `null`s para slots vazios — filter(Boolean).

### CSFloat `/api/v1/listings`

- Same-origin only (CSFloat tab é content script). Rate ~90 req antes de 429.
- v0.4: SW token bucket 45/min + 30s pause em 429. Estável.

### SkinsMonkey `/api/inventory`

- CSRF token obrigatório (cookie). 4 fallbacks pra detecção (cookie/meta/Nuxt/inline script).
- Aceita `withCharm=true` pra incluir dados de keychain.

### Steam Market `/market/priceoverview` (v0.5)

- Cross-origin → fetch precisa rodar em service worker (host_permissions allow).
- Rate hard ~20/min/IP. **Não fazer scan massivo** — só on-demand per-item.

### Skinport `/v1/items` (v0.6)

- `Accept-Encoding: br` (brotli) obrigatório.
- Cache 5min hard. Não chamar mais.

---

## NEXT UP — v0.4.1 fechado em código; smoke do Jhony pendente

Os 3 itens de trabalho (T1/T2/T3) foram entregues nesta sessão:

1. ✅ **T1 — Virtualização real do PS overlay** (`97bb7ae`)
   - `src/modules/shared/virtual-list.ts`: `computeWindow` (math puro) + `renderVirtualList` (padTop/window/padBottom, IntersectionObserver + scroll rAF-throttled). PS usa quando `filtered.length > 200`; abaixo mantém `renderChunked`. ~17–30 cards no DOM para qualquer N. 8 tests.

2. ✅ **T3 — remover `itemWithSticker=true` do PS URL** (`f370b9e`)
   - 1-line change em `fetchPs`. No-op server-side (B5). API-NOTES atualizado + fetch-URL assertion test.

3. ✅ **T2 — regenerador `rare_stickers.json` via deep scan CS.Money** (`6856aa6`)
   - Threshold fixo `RARE_THRESHOLD_USD = 0.50` (decisão #16): sticker entra no DB sse `min_price >= 0.50`. Cada sticker carrega `img`; report ganha `generated_at`. Botão Regenerate faz walk completo (não reusa o Scan raso) com progresso (páginas + elapsed) + Stop. Bundled DB nunca é trocado em runtime.

4. ⏳ **Fechar v0.4.1 — smoke do Jhony + tag `v0.4.1`** (PENDENTE — só o Jhony)
   - Smoke cenários:
     - PS scan completo (100-200 pages, ~60s, sem freeze visível no overlay durante render)
     - Filtros reativos em ≤250ms sem freeze mesmo com 5k+ items virtualizados (DOM deve ter ~17–30 cards)
     - CS.Money Regenerate → deep scan com progresso → JSON baixado com schema OK (`inferred_threshold_usd: 0.5`, `generated_at`, stickers com `img`)
     - Não-regressão: v0.2 (Arb SM↔CSF), v0.3 (Rare 3 sites), v0.4 (CSM images, 4 tiers, mutex)
   - Se passar: `git tag v0.4.1 -m "..."` + `git push origin v0.4.1`.

---

## Pendências para Jhony (não bloqueia)

- **Smoke v0.4.1** — código pronto, gates verdes. Aguardando smoke manual + tag.
- **Pseudônimo Chrome Web Store**: `sganzerla` (display name `Sganzerla`). Não bloqueia até v0.8/v1.0.
- **CI badge no README** após primeiro push de workflow (GitHub Actions rodar uma vez).

---

## Em aberto (perguntar quando necessário)

- Ícones SVG profissionais (não placeholder) — v0.7 polish.
- Source SVG do ícone hoje é simples (1.1 KB); pode ser refinado por designer no v0.7.

---

## v0.4.1 — checkpoint final (pós-smoke · estado autoritativo)

Smoke do Jhony **passou** nos 3 sites (PirateSwap, CS.Money, SkinsMonkey) + Arbitrage (CSFloat). Depois do smoke veio uma rodada de trabalho que não estava no plano original:

### Pipeline remote-rares (lista pública + atualizador privado)

- **`src/modules/rare/remote.ts`** (novo): SW busca a lista publicada em `raw.githubusercontent.com/Jhonysganzerla/skinsight/main/public/rare_stickers.json`, valida com `isValidRareList`, cacheia em `chrome.storage.local` com TTL 24h. `rare-data.ts` prefere o cache e cai no bundled se ausente/inválido — fallback nunca quebra o scanner. `host_permissions` escopado só à raw URL (nunca `<all_urls>`).
- **Popup**: seção de status da lista (contagem + idade) + botão de refresh manual (`force:true`).
- **Mensagens**: `rares:refresh` / `rares:status` no SW. Scan-start dispara `rares:refresh` fire-and-forget (TTL-gated).

### Gerador Python (PRIVADO — pasta `tools/`, gitignored)

- **`tools/update_rare_stickers.py`**: scrapeia `cs.money/5.0/load_bots_inventory/730?hasRareStickers=true`, agrega por nome (`min_price`), e faz **merge aditivo** na lista pública. Invariantes: (1) **distinct** por nome, (2) **nunca deleta** (raro não deixa de ser raro), (3) só adiciona nomes novos acima do piso. CS.Money está atrás de Cloudflare+sessão, então o script replica um request copiado do DevTools (`tools/csmoney_fetch.txt`, também gitignored — contém cookies). Passo a passo em `tools/README.md`.
- **Última execução**: 20.148 items → lista **1.313 → 3.248** raros.

### Piso de raridade $0.50 → **$1.00**

- `RARE_THRESHOLD_USD = 1.0` em `csmoney.ts`. Aplica só a **entradas novas** na geração; o runtime (`finder`) casa por **pertencimento de nome** (`lookup`), sem re-aplicar piso — entradas antigas <$1 ("grandfathered") seguem válidas.

### Filtros reativos em TODOS os sites

- Bug era site-wide: CS.Money e SkinsMonkey só aplicavam filtro no Scan, não na mudança pós-scan. Corrigido com listeners de captura no `document` escopados ao overlay (selects instantâneo, inputs debounce 250ms). PirateSwap já tinha.

### PirateSwap — scan robusto (3 fixes encadeados)

1. **Throttle silencioso**: PS responde HTTP 200 + `{items:[]}` (sem 429) quando paginado rápido. O scan parava na 1ª página vazia → morria na ponta barata. Agora encerra **só** em `empty:true` (ou erro HTTP); página vazia-sem-flag = throttle → backoff exponencial + retry, com bail de segurança.
2. **DESC**: varre do mais caro primeiro — os stickers valiosos entram nas primeiras páginas, dentro do orçamento pré-throttle (~60 págs).
3. **Hang de ~1h no "Matching"**: `findRareResults` cedia main-thread a cada 100 items (~50 `setTimeout(0)`); aba em background estrangula `setTimeout` p/ ~1/min → ~50min travado. Agora yield é **por tempo** (≥50ms de CPU), 0–3 pausas. `runScan` blindado com try/catch/finally (nunca mais fica preso em "Matching").

### Build não clobbera mais a lista

- `scripts/build-rare-data.mjs` (rodado no `prebuild`) regenerava `public/rare_stickers.json` da fonte legada (1.313), revertendo a lista do Python a cada build/pack. Agora faz no-op quando já existe lista válida (gerador Python é o dono); só regenera em checkout frio.

### Gates: typecheck/lint/**85 tests**/build/pack verdes. `main` no remoto, working tree limpo, `tools/` privado.

---

## v0.5 — Steam Market per-item oracle (PLANEJADO · aguardando aprovação)

> **Status: T2 + T3 ENTREGUES (gates verdes, 95 tests). Aguardando smoke do Jhony no navegador.** T2 = `d73bc2b` (oracle no SW + migração do scanner). T3 = `3f27083` (botão por card + cota). Os 3 ajustes obrigatórios estão dentro.\*\*
>
> **Ajustes obrigatórios da aprovação:**
>
> 1. **Contrato síncrono do Arbitrage:** o cache em memória espelhado DEVE estar hidratado **antes** do `buildExportPayload`. Resolvido (não fica em aberto): `fetchAccessoryPrices` vira async e **pré-aquece** o mirror pedindo cada preço ao SW (`steam:price`); só depois o `buildExportPayload` lê o mirror síncrono via `getSteamPrice`. Ver T2.
> 2. **Cache guarda `median_price` E `lowest_price` E `volume`.** Card exibe **`lowest_price`** como número primário.
> 3. **Preço rotulado explicitamente como USD** (currency=1). Nunca misturar com display BRL.

**Objetivo:** botão **"Show Steam price"** por card que busca o preço do item na Steam Community Market **on-demand** (1 item por clique), com o fetch movido pro service worker sob rate-limit guard. NÃO é scan massivo (briefing §9 DON'T #4 — Steam limita ~20 req/min/IP e mata a conta/IP em scan).

### Decisões fixas (do briefing + esta rodada)

- Per-item, on-demand. Nunca varredura.
- Fetch no **service worker** (CORS exige sair do background, não do content script).
- Guard: **máx 15 req/min** (margem sob o teto de 20), fila interna, **backoff exponencial em 429**.
- Cache em `chrome.storage.local`, **TTL 1h** por `market_hash_name`.
- `host_permission` `steamcommunity.com/market/*` **já existe** — não alargar.
- Indicador de cota no overlay quando perto do teto ("Steam slow — 14/15 used").

### T2 — `src/modules/oracles/steam.ts` (novo) + roteamento no SW

**Módulo `oracles/steam.ts`:**

- `export interface SteamPrice { lowestCents: number | null; medianCents: number | null; volume: number | null; currency: 'USD'; fetchedAt: number; }` — guarda **lowest + median + volume** (ajuste #2), moeda fixa **USD** (ajuste #3).
- `export async function getSteamPrice(marketHashName: string): Promise<SteamPrice | null>` — fluxo: cache-hit (TTL 1h) → retorna; senão enfileira no guard → fetch `https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=…` (`currency=1` = USD) → parse `lowest_price`, `median_price`, `volume` (todos) → cacheia → retorna. Nunca lança (retorna `null` em erro).
- **Mirror síncrono:** `export function getSteamPriceCached(marketHashName: string): SteamPrice | null` lê um `Map` em memória (espelho do `storage`), populado por `getSteamPrice`. É o contrato síncrono que o Arbitrage usa (ajuste #1).
- `export function steamQuota(): { used: number; max: number; windowMs: number }` — pro indicador de UI.
- **Rate-limit guard:** sliding window 15/60s. Reaproveitar o padrão de token-bucket que já existe em `src/modules/shared/throttle.ts` (hoje `csfloatBucket`); adicionar `steamBucket()` (15 tokens / 60s) lá, em vez de inventar outro mecanismo. Backoff: em 429, pausa o bucket por `min(30s · 2^n, 5min)`.
- **Cache:** chave `steam_price:<market_hash_name>` em `chrome.storage.local`, valor `{ lowestCents, medianCents, volume, currency:'USD', fetchedAt }`. GC oportunista (descarta entradas > TTL na leitura). O mirror em memória é hidratado na leitura do storage e em cada fetch.

**Service worker (`service-worker.ts`):**

- Novo case `steam:price` → `getSteamPrice(msg.marketHashName)` → `{ ok, data: SteamPrice | null }`.
- Novo case `steam:quota` → `{ ok, data: steamQuota() }`.
- O fetch real roda aqui (background) por causa de CORS.

**Mensageria (`shared/messaging.ts`):**

```
| { type: 'steam:price'; marketHashName: string }
| { type: 'steam:quota' }
```

**Aposentar a `steamPrice()` inline do `scanner.ts`:**

- Hoje `scanner.ts` tem `steamPrice()` (fila ~1.1s no content script) + `getSteamPrice()` sync + `fetchAccessoryPrices()`, usados pelo Arbitrage (sticker/charm pricing no `buildExportPayload`/`score.ts`).
- Redirecionar para o módulo novo **sem quebrar o Arbitrage**: a fila inline some; o Arbitrage passa a pedir preço via o mesmo guard do SW. **Regra crítica #1: NÃO mexer no algoritmo de score** — só na origem do número (`steamPrice`/`getSteamPrice`). `score.ts` permanece intocado.
- **Migração (ajuste #1 — decidido, não fica em aberto):** `buildExportPayload` lê `getSteamPriceCached` (síncrono). Para garantir o mirror hidratado **antes** do build, `fetchAccessoryPrices` vira **async** e pré-aquece: para cada `market_hash_name` único, faz `await send({ type:'steam:price', marketHashName })` (respeitando o guard do SW), o que popula o mirror. Só **depois** desse `await` o `buildExportPayload` roda e lê o mirror síncrono. O `score.ts` permanece intocado (Regra crítica #1) — só muda a origem do número.

**Testes (`tests/modules/oracles.steam.test.ts`):** mock `fetch` — valida (1) cache evita re-fetch dentro de 1h; (2) 15 cliques rápidos = 15 fetches e o 16º enfileira (não dispara já); (3) 429 → backoff, UI não trava; (4) parse de `median_price`/`lowest_price`/ausência.

### T3 — UI do botão "Show Steam price" por card

- Estado por card: `idle → loading → loaded → error`. Estilo via `tokens.css`/mockup (mesmo padrão dos chips/cards existentes).
- **Loaded exibe `lowest_price` como número primário (ajuste #2), rotulado USD explicitamente (ajuste #3):** ex. `Steam $12.34 USD` (lowest). Median + volume como secundário/tooltip (ex. `med $13.10 · vol 42`). Nunca exibir como R$/BRL.
- Funciona em **Arbitrage e Rare** cards (componente compartilhado em `shared/ui.ts`).
- Indicador de cota perto do teto no overlay ("Steam slow — N/15 used"), lido via `steam:quota`.
- Click → `send({ type:'steam:price', marketHashName })` → atualiza o card. Re-click dentro de 1h = cache (instantâneo).

### Exit criteria v0.5

- Click busca preço Steam e mostra; cache evita re-fetch em 1h; 429 não trava UI; 15 cliques rápidos respeitam o guard (15 fetches + enfileira).
- Gates verdes no CI (lint + typecheck + test + build).
- Sem `<all_urls>`, sem `clipboardRead/Write`, sem alargar `host_permissions`. Conventional Commits.

### Arquivos tocados (estimativa)

`src/modules/oracles/steam.ts` (novo), `shared/throttle.ts` (+`steamBucket`), `shared/messaging.ts` (+2 types), `background/service-worker.ts` (+2 cases), `modules/arbitrage/scanner.ts` (redireciona steamPrice), `shared/ui.ts` (botão+estado), os 2 renderers de card (Arb/Rare), `tests/modules/oracles.steam.test.ts` (novo). **Custo: M.**

---

## Spike: interceptação passiva de tráfego (Fase A — read-only · SEM CÓDIGO)

> **Entregável de diagnóstico. NENHUM arquivo de código novo nesta rodada.** Implementação só após aprovação separada.
>
> **Licença:** a TÉCNICA foi estudada a partir da extensão BetterFloat (open source sob **CC BY-NC-SA 4.0** — ShareAlike viral, **incompatível** com nossa PolyForm Noncommercial). Padrão/ideia não é protegido; expressão específica é. **Nada do código deles foi lido/copiado para cá**; a proposta abaixo é arquitetura limpa nossa. Se na implementação algo começar a espelhar estrutura de arquivo ou nomes deles, **parar**.

### A técnica (genérica)

Injetar, no **MAIN world** da página e **antes** do site fazer suas chamadas, um script que faz monkey-patch de `window.fetch` e `XMLHttpRequest.prototype.open/send`. Cada resposta JSON de URLs de interesse é re-emitida como `CustomEvent` no `document` (ex.: `skinsight:net` com `{ url, json }`). O content script (isolated world) só **escuta** — nunca faz request extra. Resultado: enquanto o usuário navega normalmente, capturamos os dados que o **próprio site já buscou**, com **zero requests adicionais** e **zero risco de throttle/ban**.

### Endpoints que cada site já chama em navegação normal (do nosso HAR/scanner atual)

| Site        | Endpoint que o site chama sozinho                    | O que carrega                          |
| ----------- | ---------------------------------------------------- | -------------------------------------- |
| SkinsMonkey | `skinsmonkey.com/api/inventory?…&withStickers=true`  | inventário ao abrir/scrollar o trade   |
| PirateSwap  | `web.pirateswap.com/inventory/v2/ExchangerInventory` | inventário do exchanger paginado       |
| CS.Money    | `cs.money/5.0/load_bots_inventory/730`               | inventário dos bots ao navegar/filtrar |
| CSFloat     | `csfloat.com/api/v1/listings?market_hash_name=…`     | listings na busca                      |

Os 4 são exatamente os endpoints que o nosso scanner ativo já consome — ou seja, os **normalizadores existentes** (`normalizePs`, `normalizeSm`, parser CS.Money) **reusam direto**, sem reverter schema novo.

### Veredito por site (vale / não vale)

- **CS.Money — VALE (alto).** Foi onde o throttle mais doeu. Toda página que o usuário rola = dados grátis sem 429. Passivo **complementa** o scan ativo: o ativo pagina exaustivamente (e leva 429); o passivo enriquece de graça conforme navega.
- **PirateSwap — VALE (alto).** Mesmo motivo: o throttle silencioso da v0.4.1 limita o scan ativo a ~2.4k items/janela. Captura passiva enquanto o usuário navega contorna isso sem custo.
- **SkinsMonkey — VALE (médio).** Inventário grande; passivo reduz nossa necessidade de marteler `/api/inventory`. Útil no modo Rare.
- **CSFloat — NÃO VALE (agora).** Já é o "oráculo" do fluxo Arbitrage via hand-off; listings passivos teriam valor marginal. Reavaliar se virarmos a precificação CSFloat passiva.

**Posicionamento vs. scanner atual:** passivo = **oportunístico e parcial** (só o que o usuário navega); ativo = **exaustivo e sob demanda** (paginação completa). Proposta: passivo **complementa**, não substitui. Merge por `id` do item (distinct, mesma regra da lista de raros), re-render debounced. O usuário ainda dispara o scan ativo quando quer cobertura total.

### Riscos (e mitigação)

- **Isolated world (MV3):** o content script padrão NÃO enxerga o `window.fetch` da página. Precisa de um content script com **`world: "MAIN"`** (Chrome 111+) **ou** injeção de `<script src=WAR>` no `document_start`. → Preferir `world:"MAIN"` (injetado pelo browser, **não** sujeito ao CSP da página).
- **CSP dos sites:** a abordagem de injetar `<script>` na página pode ser bloqueada por `script-src` estrito (CS.Money/CSFloat são SPAs com CSP). `world:"MAIN"` evita isso. → Para o build **Firefox** (suporte a `world:MAIN` mais novo/limitado), manter **fallback** via injeção de WAR script (nossos `assets/*.js` já estão em `web_accessible_resources` pros 4 hosts).
- **Ordem de carga:** tem que patchar **antes** do site chamar → `run_at: "document_start"` no script MAIN.
- **Idempotência:** flag-guard em `window` (ex.: `if (window.__skinsight_net) return;`) pra não duplicar o patch em re-injeção/SPA navigation.
- **Schema drift:** se o site mudar o shape, o normalizador quebra — mas é o mesmo risco que o scanner ativo já corre hoje; reuso = uma fonte só de verdade.
- **Privacidade/policy:** só LEMOS respostas que o site já buscou pra si; **zero rede nova, zero permissão nova, sem `<all_urls>`**. Alinhado à nossa postura. Se for a produção, documentar em `PRIVACY.md`.

### Esboço de arquitetura limpa (nossa, sob PolyForm — NÃO implementar ainda)

- `src/content/passive/interceptor.ts` (**MAIN world**, document_start): patch idempotente de fetch+XHR, filtra por allowlist de URL por site, `dispatchEvent(new CustomEvent('skinsight:net', { detail }))`. **Zero lógica de app** — só captura e re-emite.
- `src/content/passive/listener.ts` (isolated, importado por cada content script existente): `addEventListener('skinsight:net')`, roteia por URL → normalizador existente → merge distinct no result set → re-render debounced.
- `manifest.config.ts`: 2ª entrada `content_scripts` por site com `world:"MAIN"`, `run_at:"document_start"`, `js:[interceptor]`. Os scripts isolados atuais ficam como estão.

### Custo + recomendação

**Custo: M** (interceptor ~80 linhas, listener ~120, allowlist+wiring por site, manifest, testes de plumbing — filtro de URL, idempotência, dispatch/parse do evento). Risco concentrado em **`world:MAIN` + CSP + cross-browser (Firefox)** → exige smoke por site.

**Recomendação:** viável e de alto valor como **complemento** ao scan ativo, especialmente dado o throttle de CS.Money/PirateSwap. Antes de comprometer os 4 sites, fazer um **proof-of-concept fino em UM site (CS.Money — o mais castigado por throttle)** pra validar `world:MAIN`+CSP na prática; se passar, estender. Decisão de prosseguir é do Jhony (aprovação separada).

---

## v0.6 — Skinport oracle (❌ DROPPED em v0.6.1 — endpoint atrás de Cloudflare CAPTCHA)

> **Status: DROPADO.** Implementado e tagueado `v0.6.0`, mas o smoke do Jhony pegou **403 Forbidden** no `api.skinport.com/v1/items`: a Skinport pôs o endpoint atrás de **CAPTCHA da Cloudflare** (até navegador normal é desafiado; service worker não resolve challenge JS/cookie). A premissa "API pública sem auth" (pesquisa mai/2025) **não vale mais** — não é Origin/header (stripping não resolve challenge), não é rate-limit. A coluna Skinport **nunca populou**; a v0.6.0 foi tagueada "Smoke OK" com o caminho de dados quebrado.
>
> **Removido por completo de `main` em `v0.6.1`** (T1–T3): módulo + testes deletados, `renderSkinportCell`/`skinportHtml`/mensageria/case do SW/wiring nos 4 content scripts removidos, `api.skinport.com` fora do manifest (menos permissão = review Web Store mais limpo). `grep -ri skinport src/` → zero. O código vive no histórico/tag `v0.6.0` se a Skinport um dia reabrir o endpoint.
>
> **Impacto no roadmap:** o **Steam oracle (v0.5)** passa a ser a referência de preço de mercado externa. Próximo bloco real = **v0.7 Polish**.
>
> **Lição (regra geral):** para features de REDE, "smoke OK" exige confirmar que o **dado chega de fato** (status 200 + índice/coluna populada), não só que a UI não quebra. Aplicar nos próximos oráculos/integrações.

<details><summary>Detalhamento original do v0.6 (histórico — não implementar)</summary>

> Implementar T1–T4 só após o "ok" do Jhony. Prep de publicação fica para v1.0 (fora do escopo do v0.6).

**Objetivo:** oráculo local de preço de mercado da Skinport. Um fetch em massa de `api.skinport.com/v1/items` (cacheado 5min), indexado por `market_hash_name`, exibido como **coluna Skinport (USD)** no card — referência cruzada de valor de mercado para os 4 sites. Espelha o padrão remote-rares (`remote.ts`) + Steam oracle (`oracles/steam.ts`): fetch no SW, cache no storage, content script lê o cache.

### Pontos NÃO-NEGOCIÁVEIS (do briefing + esta aprovação)

1. **Cache hard 5min** em `chrome.storage.local`. **Checa TTL ANTES de qualquer fetch.** Nunca chamar `api.skinport.com` fora desse intervalo (briefing §9 DON'T #5). A TTL É o rate-limit (não precisa token-bucket).
2. **`Accept-Encoding: br`** no request. ⚠️ Nota técnica: `Accept-Encoding` é _forbidden header_ no `fetch()` — o browser controla e já manda `br` por padrão na negociação. Então a exigência é satisfeita implicitamente; não dá pra setá-lo manualmente (seria ignorado). Se a Skinport rejeitar mesmo assim, é achado a tratar (não bloqueia o design).
3. **Fetch no service worker** (CORS exige origem de background).
4. **Index local por `market_hash_name` → `{ min_price, mean_price, max_price }`** (USD cents).
5. **Re-fetch lazy:** só quando o cache expira **E** o usuário aciona um scan. Nunca em background/automático.
6. **Coluna Skinport no card, em USD explícito** (nunca BRL).
7. **`host_permission api.skinport.com` já existe** — não alargar. Sem `<all_urls>`.

### T1 — `src/modules/oracles/skinport.ts` (novo)

- `export interface SkinportPrice { minCents: number; meanCents: number; maxCents: number; }`
- **SW-side:** `refreshSkinportIndex(force = false): Promise<{ ok; count?; fetchedAt?; cached?; error? }>` — **checa TTL primeiro**; se `Date.now() - fetchedAt < 5min` e não `force` → retorna `{ ok, cached:true }` SEM fetch. Senão: `fetch('https://api.skinport.com/v1/items?app_id=730&currency=USD')` → parse `{ market_hash_name, min_price, mean_price, max_price }[]` → indexa `Record<mhn, [min,mean,max]>` (cents) → cacheia `{ fetchedAt, index }` em `chrome.storage.local` (chave `skinport_index`). Nunca lança.
- **Content-side:** `loadSkinportIndex(): Promise<void>` (lê o storage → `Map` em memória) + `getSkinportPrice(mhn): SkinportPrice | null` (lookup síncrono no Map). Mesmo padrão de `rare-data.ts` (SW escreve, content lê).
- `SKINPORT_TTL_MS = 5*60*1000`.

### T2 — Service worker + mensageria

- `shared/messaging.ts`: `| { type: 'skinport:refresh'; force?: boolean }` (+ opcional `skinport:status`).
- `service-worker.ts`: case `skinport:refresh` → `refreshSkinportIndex(msg.force)` → retorna meta. O fetch real roda aqui (CORS).
- **Fluxo lazy:** no scan-start de cada site, o content script faz `await send({ type:'skinport:refresh' })` (TTL-gated → instantâneo se fresco, fetch só se expirado), depois `await loadSkinportIndex()`, e aí renderiza com a coluna populada.

### T3 — UI da coluna Skinport

- `shared/ui.ts`: `renderSkinportCell(mhn, price | null)` (espelha `renderSteamCell`) — `Skinport $X.XX USD` com **min como número primário**; mean/max no tooltip. `skinportHtml?` em `ItemCardProps`, renderizado na coluna de ação.
- Wire em `rare/render.ts` (rare + csmoney cards) e `content/csfloat.ts` (arb), lendo `getSkinportPrice(mhn)`. Funciona offline-after-load (lookup síncrono), sobrevive à virtualização (re-deriva do índice).
- Sem botão por-card (diferente do Steam): a coluna popula sozinha após o `loadSkinportIndex` do scan, já que o índice é em massa.

### T4 — Testes (`tests/modules/oracles.skinport.test.ts`)

- TTL: **não faz fetch** quando cache < 5min (o ponto crítico do §9 DON'T #5); faz quando expira ou `force`.
- Parse: array da Skinport → index `{minCents,meanCents,maxCents}`.
- Lookup síncrono por `market_hash_name`.
- Nunca lança (erro de rede → `{ ok:false }`, índice antigo preservado).

### Exit criteria

- Coluna Skinport (USD) aparece nos cards cujo item está no índice.
- **Nunca** chama `api.skinport.com` mais de 1×/5min (teste prova: cache fresco → zero fetch).
- Fetch no SW, sem erro de CORS. Sem alargar `host_permissions`, sem `<all_urls>`.
- Gates verdes (lint + typecheck + test + build). Conventional Commits.

### Arquivos (estimativa)

`src/modules/oracles/skinport.ts` (novo), `shared/messaging.ts` (+1-2 tipos), `background/service-worker.ts` (+1 case), `shared/ui.ts` (+`renderSkinportCell` + `skinportHtml`), `modules/rare/render.ts` (wire), `content/{csfloat,pirateswap,skinsmonkey,csmoney}.ts` (refresh+load no scan-start + célula), `tests/modules/oracles.skinport.test.ts` (novo). **Custo: M.**

> **PARA AQUI** — aguardando aprovação do Jhony antes de implementar T1–T4.

</details>

---

## v0.7 — Polish (PLANEJADO · aguardando aprovação · NÃO IMPLEMENTAR ainda)

> **Status: detalhamento para aprovação (briefing §12).** Roadmap corrigido: v0.7 (Polish) → v0.8 (Beta privado) → v1.0 (publicação). Prep de publicação NÃO é agora (screenshots/listing dependem da UI polida; pular geraria retrabalho). Implementar T2–T6 só após o "ok"; **T1 (Fase A) é read-only e já pode rodar quando aprovado** — é o item de maior risco.

**Objetivo:** lapidar a extensão para um beta privado de qualidade — sem features novas de dado, foco em robustez, i18n, UX de configuração/entrada e docs.

### T1 — Fase A: audit de memory-leak (READ-ONLY · diagnóstico antes de tocar código)

Maior risco: sessão longa com **Steam oracle + virtualização + listeners reativos** rodando juntos (a Skinport saiu, mas o resto permanece). **Investigação read-only + proposta escrita no PLAN; zero código nesta sub-fase.** Suspeitos a auditar:

- **Steam mirror (`_mirror` Map em `oracles/steam.ts`)** — cresce sem limite (todo item precificado fica pra sempre). Sessão longa → creep. Avaliar cap/LRU/TTL-evict.
- **Virtual-list (`virtual-list.ts`)** — `destroy()` desconecta o `IntersectionObserver` e remove o listener de scroll/rAF? Churn de re-render acumula observers/nós destacados?
- **Listeners de filtro reativo (capture-phase no `document`)** — PS/CS.Money adicionam no mount; em re-mount/SPA-renavegação os antigos são removidos? (SkinsMonkey registra uma vez no bootstrap justamente p/ evitar dup — confirmar os outros.)
- **`steam-ui` listener delegado** (`_steamWired`) + **overlay drag listeners** + **flog ring buffer** — vazam em re-injeção?
- **Timers** (`setTimeout`/debounce) órfãos; nós DOM destacados retidos.
- **Re-injeção de content script** em SPAs (cs.money/csfloat/SM) — estado/listeners duplicados entre navegações.
- **Entregável:** seção "Spike: memory-leak audit (Fase A)" no PLAN com achado por suspeito + veredito + fixes propostos (implementados depois, em tarefa aprovada). Método: DevTools Memory (heap snapshots antes/depois de N scans + navegação), detached-nodes, listener count.

#### Spike: memory-leak audit (Fase A) — RESULTADO (read-only, sem código)

Auditoria estática (leitura de `overlay.ts`, `virtual-list.ts`, `oracles/steam.ts`, `steam-ui.ts`, e os 4 content scripts). Achados por severidade:

- **🔴 ALTO — `overlay.ts` `enableDrag`: window listeners nunca removidos + root destacado retido.**
  `enableDrag` (overlay.ts:160-195) faz `window.addEventListener('mousemove', …)` e `window.addEventListener('mouseup', …)` que **nunca são removidos**. `destroy()` (overlay.ts:127-130) só faz `root.remove(); minbar.remove();`. Cada `createOverlay()` adiciona **2 listeners permanentes no `window`** cujos closures capturam `root` → o nó `root` destacado (e toda a subtree) fica **retido para sempre**. `createOverlay` remove o DOM antigo por id (linha 67-68) mas **não** desliga os listeners do drag antigo.
  **Exercitado por:** SkinsMonkey flip de modo (`mount → unmount → createOverlay` a cada flip, skinsmonkey.ts:331/368) e close→reopen em qualquer site. Sessão longa alternando modo/abrindo-fechando = acúmulo de window-listeners + overlays destacados.
  **Fix proposto:** `enableDrag` registra via `AbortController`; guardar o controller no handle; `destroy()` faz `controller.abort()` (remove mousemove/mouseup de uma vez) antes de `root.remove()`. Custo baixo.

- **🟢 MÉDIO — FALSO-POSITIVO (corrigido no T1.b após re-trace do código).**
  A análise inicial dizia que o `renderHandle` não era destruído no close. Re-traçando: o `onClose` do PS chama `abort()` (pirateswap.ts:361) e **`abort()` já faz `state.renderHandle?.destroy()`** (pirateswap.ts:340) → `vh.destroy()` remove scroll+resize+observer. Ou seja, **o handle É destruído no close**. Único caminho de teardown = botão close → onClose → abort(); sem gap. **CS.Money e SkinsMonkey não usam virtual-list** (render por `innerHTML` puro) → não há handle/observer/resize p/ vazar. **Nenhuma mudança de código necessária.** (Lição: o re-trace pegou o que a leitura estática inicial não — `abort()` cobre o teardown.)

- **✅ BAIXO — `oracles/steam.ts` `_mirror` Map cresce sem limite (CORRIGIDO no T1.b).**
  Era ilimitado numa sessão muito longa. Corrigido: `_mirror` agora é capado em `STEAM_MIRROR_MAX=1000`, insertion-ordered, evict-oldest (`mirrorSet`).

- **🟢 OK (verificado, sem leak):**
  - `virtual-list.destroy()` remove scroll+resize e dá `observer.disconnect()` ✓ (o problema é só **chamá-lo** no close — ver MÉDIO acima). O rAF pendente no destroy não é cancelado, mas o callback faz no-op (`if (destroyed) return`) — inócuo.
  - **Filtros reativos:** SkinsMonkey registra **uma vez** no bootstrap (`registerRareFilterListeners`, guard `currentMode==='rare'`) — sem dup por flip ✓. PS/CS.Money adicionam no `mount()` que é **guardado** (`if (overlay) return`) e roda 1× por load de página → não duplica; ficam órfãos-mas-guardados (`if (!overlay) return`) após close — risco baixo (1 par de listeners por vida da página).
  - `steam-ui` listener delegado: idempotente via `_steamWired` no `overlay.body` ✓.
  - **Re-injeção SPA:** content scripts MV3 injetam 1× por load de documento; troca de rota SPA **não** re-injeta → estado de módulo não duplica por navegação. O risco de re-`createOverlay` vem dos flips de modo do SM + close/reopen, não da SPA.

**Veredito:** 1 leak ALTO real (drag window-listeners); o MÉDIO virou falso-positivo no re-trace; 1 menor (cap do `_mirror`).

#### T1.b — fixes do audit (ENTREGUE · gates verdes, 101 tests)

- **ALTO ✅** — `overlay.ts`: `enableDrag` + todos os listeners do shell registrados com um `AbortController`; `destroy()` faz `ac.abort()` antes de `root.remove()`. Corrige os 4 sites de uma vez. Teste de regressão `tests/modules/overlay.drag-cleanup.test.ts` (signal abortado após destroy; 2 ciclos create→destroy sem acúmulo).
- **MÉDIO ✅** — re-trace: já coberto por `abort()` no `onClose` do PS; CS.Money/SM não usam vlist. Sem código.
- **BAIXO ✅** — `oracles/steam.ts`: `_mirror` capado (`STEAM_MIRROR_MAX=1000`, evict-oldest via `mirrorSet`).
- **PARA AQUI** — aguardando ok do Jhony antes de T2–T6.

### T2 — Ícones SVG profissionais

Substituir o crosshair placeholder por um SVG profissional → rasterizar p/ PNG 16/32/48/128 via o `scripts/build-icons.mjs` existente. Atualizar `action.default_icon` + `icons` (já wirados).

### T3 — i18n PT-BR + EN (HÍBRIDO — desvio consciente registrado)

**Desvio consciente do briefing §6** (que pedia `chrome.i18n`): para as strings do overlay/popup usamos um **módulo interno leve** `t(key)`. **Motivo:** `chrome.i18n` resolve o locale pelo idioma do navegador e **não permite override em runtime** — e queremos um **seletor de idioma nas options** (T4). O módulo interno dá esse override; `chrome.i18n` não.

**Híbrido obrigatório:** manter um **`_locales` MÍNIMO** só para o **manifest** (`name`/`description` via `__MSG_*__` + `default_locale`), senão o **listing da Web Store não localiza** no v1.0.

→ módulo interno `t(key)` (overlay/popup + override nas options) **+ `_locales/{en,pt_BR}` mínimo** (manifest/store). Detecção default por `navigator.language`. Zero string hard-coded restante no overlay.

### T4 — Options page

`options_ui` no manifest + página dedicada para o que não cabe no popup: override de idioma, parâmetros de scan default (delay/max-pages), toggle de debug (`skinsight:debug`), reset de cache (rares/steam). Persiste em `chrome.storage.local` via o `storage.ts` existente.

### T5 — Onboarding

Primeira execução: abrir uma aba de boas-vindas explicando os modos (Rare/Arbitrage), os sites suportados e o fluxo básico. **`chrome.tabs.create` no `onInstalled` é OK aqui — escopado a `details.reason === 'install'`** (NÃO dispara em `update`/`chrome_update`; não cai no DON'T #7, que veda `tabs.create` fora de ativação do usuário em fluxos recorrentes). Mostrar uma única vez (o próprio `reason==='install'` já garante; sem flag extra necessária).

### T6 — Docs completas

Finalizar `docs/ARCHITECTURE.md` (data-flow atual: 4 content scripts + SW + oráculo Steam + remote-rares), `docs/API-NOTES.md` (endpoints + a queda da Skinport), `docs/CONTRIBUTING.md`, e polir o `README.md`. Refletir o roadmap corrigido.

### Ordem sugerida

T1 (Fase A, read-only) → T2 → T3 → T4 → T5 → T6. T1 primeiro porque é o risco; o resto é mecânico e paralelizável.

### Exit criteria

- T1: seção de audit no PLAN com veredito + fixes propostos (sem código).
- Ícones nítidos em 16/32/48/128. Strings alternam PT-BR/EN. Options persiste. Onboarding aparece 1×. Docs completas e coerentes com o roadmap.
- Gates verdes: typecheck + lint + **format:check** + testes + build. Conventional Commits.
- Sem `<all_urls>`, sem alargar permissões além do necessário (options/onboarding não exigem host novo).

### Arquivos (estimativa)

T2: `scripts/build-icons.mjs` + SVG source + `manifest.config.ts`. T3: novo `modules/shared/i18n.ts` + `_locales/*` (se `chrome.i18n`) + toques nos content scripts/popup. T4: `src/options/{options.html,options.ts,options.css}` + `manifest.config.ts`. T5: `service-worker.ts` (onInstalled) + página/asset de welcome. T6: `docs/*` + `README.md`. **Custo: M–L** (T1 read-only; T3 é o mais espalhado).

> **PARA AQUI** — aguardando aprovação do Jhony antes de implementar T2–T6 (e o "ok" para rodar T1 read-only).
