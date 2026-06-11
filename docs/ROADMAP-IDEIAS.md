# Skinsight — Roadmap de funcionalidades (análise 2026-06-11)

> Gerado por agente analista de produto. Horizontes: H1 = dias, sem permissão
> nova; H2 = 1-2 semanas, pode pedir `alarms`/`notifications`; H3 = pós-1.0.

## Leitura do produto

O Skinsight já é um scanner ativo genuíno — raro no nicho. Os três motores
(rare sticker com ROI contra 3.248 raros, pattern query-by-name de 50 skins,
arbitragem SM→CSFloat com bucket compartilhado) estão bem engenheirados para
os rate limits reais. A fronteira de valor para o trader é o **tempo entre a
oportunidade existir e ele agir**: hoje o produto responde "o que existe agora
neste site?", mas exige presença ativa, não distingue o novo do já visto, e os
resultados morrem com a aba. Faltam três degraus, todos sem backend:
**memória** (diff/snapshot/export), **vigilância** (watchlist + scan agendado —
o PirateSwap é público e sem auth, escaneável do service worker) e
**liquidez** (Doppler/facas, onde o mercado de pattern realmente está).

## H1 — Quick wins (sem permissão nova, sem backend)

1. **Diff de scan: selo "NOVO" + seen-set persistente** ⭐ (S-M)
   Persistir chaves vistas por site×submodo (chave de dedupe já existe em
   pattern-query.ts), badge "NOVO" nos cards + filtro "só novos". Base técnica
   de watchlist/sentinela. Capar o set (~5k chaves).
2. **Snapshot do último scan + restauração** (S-M)
   `last_scan:<site>:<submode>` no storage; "Restaurar último scan (há 2h)" no
   mount. Multiplica o valor de cada request gasto. Capar em ~500 itens.
3. **Exportar CSV/JSON** (S)
   Padrão Blob+a[download] já existe no regenerador do csmoney.ts — extrair
   helper. Zero permissão.
4. **Filtros que o dado já suporta: min ROI, min profit, float máx** (S)
   `applyRareFilter` já aceita minRoiPct/minStickers — só expor na UI.
   Capturar `paintWear` no normalizeSm + chip de float condicional.
5. **Deep-links mais fortes + copiar market_hash_name** (S)

Descartado: score unificado entre modos (semânticas incomensuráveis; só
harmonizar o visual hot/warm/neutral que já existe).

## H2 — Diferenciais

1. **Watchlist + Sentinela em background** ⭐ (M-L; `alarms`+`notifications`)
   PirateSwap é público, sem auth, com filtro server-side por seed/fade — roda
   do SW. Alarm 15-30 min, rodada enxuta (só alvos marcados, máx ~20 req,
   jitter, auto-desliga após N falhas), notificação com link. CSM/SM ficam de
   fora do background (Cloudflare/CSRF). É a feature de retenção e a espinha
   do tier Pro.
2. **Interceptação passiva de tráfego (PoC CS.Money)** (M)
   content script world:MAIN monkey-patcheia fetch/XHR, re-emite respostas da
   allowlist; merge no result set existente. Zero requests novos. Spike já
   aprovado no PLAN (Fase A).
3. **Doppler phases + facas Case Hardened** (M)
   Doppler é determinístico por `paint_index` (sem seed-list!) e é o maior
   mercado de pattern premium. Nova família `doppler` method `paint-index`;
   exclusão de ★ vira por-família. Facas CH: destravar o sweep-patterns.mjs.
   "Doppler phase checker" é termo de busca real na CWS.
4. **Notificação de fim de scan / hit quente** (S; subconjunto de H2.1)
5. **CI cron re-precificando rare_stickers.json** (M; fora da extensão)
   O canal raw.githubusercontent + TTL 24h já entrega sem release.

Descartado: comparador multi-site (reavaliar após captura passiva);
sparklines standalone (vira sub-feature da sentinela).

## H3 — Visão (pós-1.0)

1. **Skinsight Pro**: Free = scans manuais + diff + export + 1 alvo de watch;
   Pro (~US$5/mês ou Pix anual) = watchlist ilimitada, alarm 10-15 min,
   Telegram, histórico. Gate: Cloudflare Worker + KV validando license key.
2. **Alertas Telegram** (S-M sobre a sentinela; 1 host novo — pedir na mesma
   re-review do Pro).
3. **Tracking de portfólio/inventário** (L; ler inventário público do steamid
   do usuário e valorar com os oráculos existentes).
4. **CSFloat como superfície de Pattern** (M; única API oficial documentada
   do stack — forte candidato a primeiro item pós-1.0).
5. **Novos sites trade-bot** (Tradeit/Skinswap) — só após HAR confirmar
   inventário público com stickers/seed. Skinport e Buff163: não voltar.

## Top 5 em ordem

1. H1.1 Diff/seen-set — dependência de tudo que vigia.
2. H1.2+H1.3 Snapshot + Export — mesma release, mesmo dado.
3. H2.3 Doppler + facas CH — expande o QUE vale vigiar antes da sentinela.
4. H2.1 Watchlist + Sentinela — chega com tudo pronto; 1 re-review só.
5. H2.2 Interceptação passiva — PoC paralelo, não bloqueia o trem.

## O que NÃO fazer agora

- Backend/contas antes do Pro validado (mata o claim "no backend" do listing).
- Scan massivo/histórico via Steam Market (15 req/min = inviável; risco de ban).
- Sniper com auto-compra (ToS + política CWS + risco reputacional). Alertar
  sim; agir pelo usuário, nunca.
- Skinport/Buff163 (muros comprovados; lição da v0.6 já foi paga).
- Refactor/unificação do score de arbitragem (Regra crítica #1).

> CWS: agrupar `alarms`+`notifications` numa única versão com justificativa
> explícita no listing e no PRIVACY.md — uma re-review bem documentada, não duas.
