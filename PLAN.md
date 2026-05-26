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

### Aguardando aprovação do reviewer para iniciar v0.2.

---

## Em aberto (perguntar quando necessário)

- Conta GitHub do projeto (precisa de um nome de org/user para push de tag e CI). Default por enquanto: configurar local; remote fica para usuário definir.
- Pseudônimo para Chrome Web Store (briefing §11 alerta sobre brand isolation). Não bloqueia v0.1.
- Ícones SVG profissionais — placeholder em v0.1, profissional em v0.6.
