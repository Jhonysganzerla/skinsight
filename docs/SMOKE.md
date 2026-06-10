# Smoke checklist

Manual QA before tagging a release. Automated gates (`typecheck · lint ·
format:check · test · build`) must already be green — this covers what tests
can't: the real overlay on each live site, cross-tab orchestration, and the
browser-only UI surfaces.

## 0. Setup

- `npm run build` → `chrome://extensions` → **Remove + Load unpacked** (`dist/`).
  Use _Remove + Load_, not _Reload_ — MV3 can serve cached chunks on a plain
  reload, and a fresh install is what triggers onboarding.
- Reload each site tab after (re)loading the extension — content scripts only
  re-inject on a page reload.

## 1. Onboarding (v0.7 T5)

- [ ] First install opens **one** welcome tab automatically (2 modes · 4 sites · 3 steps).
- [ ] Reloading the extension (update) does **not** reopen it.
- [ ] Text follows the browser language (PT-BR on a PT browser).

## 2. Popup

- [ ] Opens on all 4 sites; active site shows the "Active tab" pill, others "Ready".
- [ ] Icon colors: SM yellow · PS brown · CS.Money purple · CSFloat blue (last).
- [ ] Mode toggle (Rare/Arbitrage) affects SkinsMonkey only; switching persists.
- [ ] "Rare list → ↻ Refresh" updates the count/timestamp.
- [ ] Donate: "Show Pix QR" expands a scannable QR; "Copy Pix" copies the full
      copia-e-cola (BR Code). "⚙ Options" opens the options page.

## 3. Options (v0.7 T4 + v0.8 T1)

- [ ] Language Auto/English/Português — switch to English, reopen popup/overlay:
      strings localize; back to PT. **Persists** across close.
- [ ] Default SkinsMonkey mode reflects in the popup.
- [ ] **Profit/fees**: edit a fee → "Saved ✓" flashes; reopen → value persisted;
      caret isn't lost mid-edit (no re-render on change).

## 4. Scans — per site × mode

- [ ] **SkinsMonkey · Rare**: Scan → cards with rare stickers.
- [ ] **SkinsMonkey · Arbitrage**: Scan → opens/focuses CSFloat; analysis runs there.
- [ ] **PirateSwap · Rare**: Scan → list, smooth scroll (no runaway auto-scroll).
- [ ] **CS.Money · Rare**: Scan → cards; changing "Sort" re-orders without a rescan.
- [ ] **CSFloat**: receives the SM handoff and shows the profit-scored list.

## 5. "Possível lucro" (v0.7 + v0.8 T1)

- [ ] SM/PS rare cards show **`bônus CS.Money (est.) +$X`** (gross overpay).
- [ ] SM/PS rare cards show **`lucro líq. (est.) ±$X`** (after fees); goes negative
      when fees outweigh the overpay.
- [ ] Editing fees in options → re-scan SM/PS → the `lucro líq.` chip changes.
- [ ] CS.Money cards show **neither** chip (it's CS.Money's own base).

## 6. Float/wear + Steam

- [ ] Wear badge (FN/MW/FT/WW/BS) next to the name on cards (incl. SkinsMonkey).
- [ ] "Steam price" on a card → "Steam $X.XX USD" (or "no data"); never hangs.

## 7. Robustness (v0.8 T2)

- [ ] **Abort mid-scan**: click Stop → "Scan stopped", button returns to "Scan"
      (never stuck on "Stop").
- [ ] **Network error**: DevTools → Network → Offline, then Scan → localized error
      status and the button returns to "Scan" (recoverable). Back online → rescan works.
- [ ] **CSFloat failure**: on analyzer error the overlay resets to the idle body
      (Refresh) with an error status — not stuck on "Analyzing…".

## 8. i18n spot-check

- [ ] With English selected: overlay (filters, scan bar, headers, empty states)
      and popup all in English; switch back to PT-BR and re-check.

## 9. v0.9.0 hardening (analyst pass)

- [ ] **⚠ use_dynamic_url**: load the unpacked build and confirm the overlay
      mounts on all 4 sites AND Patterns mode finds the bank (rare_patterns.json
      loads). If anything fails to load, revert the two `use_dynamic_url` lines
      in manifest.config.ts — cheap rollback.
- [ ] **Close = hide**: × collapses the overlay to the minbar (scan aborts);
      minbar click restores it WITH the previous results. No F5 needed.
- [ ] **CSFloat Stop**: stop mid-analysis → partial results render with a Rescan
      button that works (previously: dead bar until next payload).
- [ ] **Pattern Stop parcial**: stop the hunt at skin ~20/50 → partial hits
      render + status "Interrompido — N hits parciais".
- [ ] **Filter grid hidden in Patterns**: switching the popup submode to
      Patterns hides the sticker filters (Max pages/price/sort) on all 3 sites;
      switching back restores them.
- [ ] **Tier filter**: pattern toolbar shows the tier select (Todos / T1 /
      T1–T2); counts on the weapon tabs follow it.
- [ ] **Handoff without "tabs" permission**: SkinsMonkey Arbitrage scan →
      CSFloat tab opens/focuses and receives the payload (the permission was
      removed; host permissions should cover it).
- [ ] **Remote pattern bank**: popup's refresh button (or first scan) populates
      `chrome.storage.local.patterns_remote` (DevTools → Application). Patterns
      still work offline (bundled fallback).
