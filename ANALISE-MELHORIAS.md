# Análise de melhorias — Skinsight v0.9.0

> Gerado por revisão de agente analista em 2026-06-10.
> Gates verificados: `typecheck` ✅ · `lint` ✅ · `test` ✅ (235/235 em 28 arquivos).

## Avaliação geral

Base muito acima da média para um v0.9. Pontos fortes: TS strict com `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`; manifest enxuto (só `storage` + hosts exatos justificados); XSS bem resolvido (`esc()`/`safeUrl()` em todo dado de terceiros); scraping robusto (detecção de mudança de schema via `onWarn`, retry com backoff, token buckets centralizados no SW, fallback bundled validado); performance pensada (yield por tempo, `renderChunked`, virtual list, LRU); testes com substância (parity do score à mão, fixtures reais, teste de leak de listener); comentários que explicam *porquês*.

O que separa do v1.0 publicável: 3 fixes de runtime, consolidação da duplicação dos content scripts e a burocracia do listing da Chrome Web Store.

## CRÍTICO

1. **Storage cresce sem limite (`steam_price:*`)** — `src/modules/oracles/steam.ts:39,101-108`. `writeCache` cria uma chave por `market_hash_name` e nada remove (TTL só é checado na leitura). Caminha para a quota de 10 MB. **Fix:** GC no `onStartup` do SW varrendo chaves vencidas, ou mapa único com cap (como o mirror já faz).

2. **Render síncrono no CSFloat** — `src/content/csfloat.ts:68-79` monta todos os cards com `rows.map(...).join('')`. Mesmo padrão que congelou o PirateSwap. **Fix:** usar `renderChunked` (já existe e é testado).

3. **Gate de rate-limit "falha aberto" quando o SW morre** — `service-worker.ts:105-108` + `analyzer.ts:17-19`. Se o bucket está pausado por 429 e o SW atinge idle do MV3, o `sendMessage` rejeita e `defaultRequestSlot` ignora o `{ok:false}` — analyzer segue sem throttle justo durante o 429. **Fix:** em `defaultRequestSlot`, dormir ~1.5 s quando `!r.ok`; ou SW responder `retryAfterMs` em vez de bloquear.

4. **Bloqueadores de publicação CWS (processo):** URL pública da privacy policy no dashboard; certificação de uso de dados ("não coleta", mas marcar acesso a "website content" — os scans usam `credentials: 'include'`); justificativa escrita de cada `host_permission`; screenshots do listing.

## IMPORTANTE

1. **Duplicação ~60-70% entre os 3 content scripts Rare** (skinsmonkey/pirateswap/csmoney): `State`, `runPatternQuery` (3 cópias), `scheduleFilterApply`, `finish`/`abort`. Custo já visível: virtual list só existe no PirateSwap — SkinsMonkey (até 80 pág × 120 itens) ainda monta tudo no DOM. **Fix:** extrair `createRareScanController(site, collector, renderer)` em `modules/shared/` (base: o `applyAndRender` do PS). Remove ~400 linhas.
2. **Fetches paginados sem timeout** — `fetchSm` (finder.ts:51), `fetchPs` (finder.ts:136), `collectCsMoney` (csmoney.ts:197) usam `fetch` cru; socket pendurado congela o scan. Usar o `fetchWithTimeout` (net.ts) que já existe.
3. **`getCsrf()` não cacheado** — `scanner.ts:61-91` faz `JSON.stringify(window.__NUXT__)` (MBs) + regex a cada chamada. Memoizar por page-load.
4. **Race read-modify-write em settings** — `overlay.ts:274-286` e `storage.ts:167-179` (get→merge→set). Fix barato: chave própria `overlay_state` fora do blob `settings`.
5. **Dependências de build em risco** — `@crxjs/vite-plugin 2.0.0-beta.25` (beta), Vite 5, `@types/chrome 0.0.268`. Migrar para crxjs 2.x estável antes do v1.0 (provavelmente elimina o workaround de `assets/*.js` no manifest) e re-smoke do `use_dynamic_url`.
6. **Throughput do analyzer** — até 2 req/item, serial, 45/min → 600 itens ≈ 25 min sem ETA. Fix curto: mostrar ETA na barra; melhor: deduplicar por (defIndex, paintIndex, seed).
7. **CI não gera o zip de release** — adicionar job (em tag) com `npm run pack` + upload do artefato.

## DESEJÁVEL

- Higiene de repo público: path local com username em `popup.ts:8`; `skinsight-0.1.0.zip` morto na raiz; rótulo `build=diag-capture` em `pirateswap.ts:521`; adicionar `vitest.config.ts.timestamp-*` ao `.gitignore`.
- Rodar `--coverage` no CI com threshold.
- ESLint: usar pacote `globals` (`browser` + `webextensions`) em vez de lista manual.
- Tipar `MessageResponse.data` (mapa tipo→resposta) para eliminar casts (popup.ts:110).
- README v1.0: screenshots/GIF, seção para usuário final, disclaimer de ToS.

## Riscos MV3 / Chrome Web Store

- Listas remotas (`rare_stickers.json`/`rare_patterns.json`) são **dados**, não código — permitido no MV3 e já validadas; declarar o fetch remoto na ficha de review.
- **ToS dos marketplaces:** todos os endpoints são privados/não documentados; sites podem mudar schema (mitigado por `onWarn`) ou **banir conta por automação** → disclaimer explícito no welcome/README. Considerar kill switch remoto: flags no próprio `rare_patterns.json` para desativar um site quebrado sem release.
- Token buckets resetam a cada restart do SW (burst pós-restart pode tomar 429; pause mitiga).
- Versionamento: commits "v0.9.1/v0.9.2" sem bump no package.json — seguir o ritual do PLAN.md à risca (CWS rejeita versão repetida/regressiva).

## Testes

Bem coberto: lógica pura (score parity, normalizadores com fixtures reais, throttle, virtual list, renderChunked, sanitização remota, i18n). Lacunas por ordem de importância:

1. `service-worker.ts` — zero testes (hub da arbitragem; testável com stub de `chrome.*` já usado em outros testes).
2. Nenhum E2E — 1 smoke com Playwright (carregar build → popup abre → overlay injeta) pega quebras de manifest/chunks/WAR que unit test não vê.
3. Caminho 429/retry de `fetchCsfPrice` (analyzer.ts:96-102) sem teste.

## Top 5 ações (ordem de prioridade)

1. Corrigir os 3 críticos de runtime (GC do storage, renderChunked no CSFloat, gate que falha aberto).
2. Extrair controller compartilhado dos content scripts Rare (~−400 linhas; virtual list no SkinsMonkey de graça).
3. Pacote CWS: privacy policy pública, justificativas de permissão, screenshots, disclaimer de ToS, crxjs 2.x estável.
4. Testes do service worker + 1 smoke E2E Playwright.
5. Higiene de release: ritual de versão, job de CI com zip, limpar paths locais e labels de debug.
