/**
 * Pattern results view (v0.9.2) — shared by the 3 sites' content scripts.
 *
 * A 50-skin bank query can return hundreds of hits (659 on the first SM
 * smoke), so the flat list gained navigation, per the maintainer's sketch:
 *   - weapon tabs with hit counts ("Todas / Galil AR / Desert Eagle / …");
 *   - finish sub-tabs when the selected weapon has more than one bank skin
 *     ("AK-47 → Case Hardened / …");
 *   - a StatTrak™-only toggle;
 *   - price sort (default keeps the query order: bank order, then site order).
 *
 * One delegated click + change listener pair on the container survives the
 * innerHTML rewrites; `destroy()` removes them and aborts any in-flight
 * chunked render.
 */
import { esc, fmtUsd } from '../shared/fmt';
import { t } from '../shared/i18n';
import { renderChunked, renderResultsHeader } from '../shared/ui';
import { renderPatternCard } from './render-pattern';
import type { PatternResult } from './types';

export interface PatternViewHandle {
  destroy(): void;
}

type SortKey = 'default' | 'priceAsc' | 'priceDesc';

interface ViewState {
  weapon: string; // 'all' or weapon display name
  finish: string; // 'all' or finish display name
  stOnly: boolean;
  sort: SortKey;
}

/** "StatTrak™ AK-47 | Case Hardened (Field-Tested)" → "AK-47 | Case Hardened". */
function baseName(marketHashName: string): string {
  return marketHashName
    .replace(/^\s*★\s*/, '')
    .replace(/^\s*StatTrak[™™]?\s*/i, '')
    .replace(/^\s*Souvenir\s*/i, '')
    .replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, '')
    .trim();
}

function weaponOf(r: PatternResult): string {
  return baseName(r.marketHashName || r.name).split(' | ')[0] ?? '?';
}

function finishOf(r: PatternResult): string {
  return baseName(r.marketHashName || r.name).split(' | ')[1] ?? '';
}

function isStatTrak(r: PatternResult): boolean {
  return /^\s*StatTrak/i.test(r.marketHashName || r.name);
}

function tabHtml(
  value: string,
  label: string,
  count: number,
  active: boolean,
  sub = false,
): string {
  return `<button type="button" class="sh-tab${active ? ' active' : ''}" data-pt-${sub ? 'finish' : 'weapon'}="${esc(value)}">
    ${esc(label)}<span class="sh-tab-n">${count}</span>
  </button>`;
}

export function mountPatternView(container: HTMLElement, rows: PatternResult[]): PatternViewHandle {
  const state: ViewState = { weapon: 'all', finish: 'all', stOnly: false, sort: 'default' };
  let chunkHandle: { abort(): void } | null = null;

  function visibleRows(): PatternResult[] {
    let arr = state.stOnly ? rows.filter(isStatTrak) : rows;
    if (state.weapon !== 'all') arr = arr.filter((r) => weaponOf(r) === state.weapon);
    if (state.finish !== 'all') arr = arr.filter((r) => finishOf(r) === state.finish);
    if (state.sort !== 'default') {
      arr = [...arr].sort((a, b) =>
        state.sort === 'priceAsc' ? a.price - b.price : b.price - a.price,
      );
    }
    return arr;
  }

  function render(): void {
    chunkHandle?.abort();
    chunkHandle = null;

    const stRows = state.stOnly ? rows.filter(isStatTrak) : rows;
    const byWeapon = new Map<string, number>();
    for (const r of stRows) byWeapon.set(weaponOf(r), (byWeapon.get(weaponOf(r)) ?? 0) + 1);
    if (state.weapon !== 'all' && !byWeapon.has(state.weapon)) state.weapon = 'all';

    const weapons = [...byWeapon.entries()].sort((a, b) => b[1] - a[1]);
    const tabs =
      tabHtml('all', t('pattern.tabs.all'), stRows.length, state.weapon === 'all') +
      weapons.map(([w, n]) => tabHtml(w, w, n, state.weapon === w)).join('');

    // Finish sub-tabs only when the weapon has >1 bank skin among the hits.
    let subTabs = '';
    if (state.weapon !== 'all') {
      const byFinish = new Map<string, number>();
      for (const r of stRows) {
        if (weaponOf(r) !== state.weapon) continue;
        byFinish.set(finishOf(r), (byFinish.get(finishOf(r)) ?? 0) + 1);
      }
      if (state.finish !== 'all' && !byFinish.has(state.finish)) state.finish = 'all';
      if (byFinish.size > 1) {
        const total = [...byFinish.values()].reduce((a, b) => a + b, 0);
        subTabs =
          `<div class="sh-pattern-tabs sub" data-role="pt-subtabs">` +
          tabHtml('all', t('pattern.tabs.all'), total, state.finish === 'all', true) +
          [...byFinish.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([f, n]) => tabHtml(f, f || '—', n, state.finish === f, true))
            .join('') +
          `</div>`;
      } else {
        state.finish = 'all';
      }
    } else {
      state.finish = 'all';
    }

    const visible = visibleRows();
    const sumUsd = visible.reduce((a, r) => a + (r.price > 0 ? r.price : 0), 0);
    const sortOpt = (v: SortKey, label: string): string =>
      `<option value="${v}"${state.sort === v ? ' selected' : ''}>${esc(label)}</option>`;

    container.innerHTML = `
      <div class="sh-pattern-tabs" data-role="pt-tabs">${tabs}</div>
      ${subTabs}
      <div class="sh-pattern-toolbar">
        <label class="sh-checkbox"><input type="checkbox" data-pt-st${state.stOnly ? ' checked' : ''}> ${esc(t('pattern.st'))}</label>
        <select class="sh-select" data-pt-sort>
          ${sortOpt('default', t('pattern.sort.default'))}
          ${sortOpt('priceAsc', t('sort.priceAsc'))}
          ${sortOpt('priceDesc', t('sort.priceDesc'))}
        </select>
        <span class="sh-pt-count">${esc(t('pattern.count', { n: visible.length }))} · ${esc(fmtUsd(sumUsd))}</span>
      </div>
      <div data-role="pt-list"></div>
    `;

    const list = container.querySelector<HTMLElement>('[data-role=pt-list]')!;
    const header = renderResultsHeader(t('pattern.results.header'), t('pattern.results.right'));
    if (!visible.length) {
      list.innerHTML =
        header +
        `<div class="sh-empty">
          <div class="sh-empty-icon">⌖</div>
          <div class="sh-empty-title">${t('pattern.empty.title')}</div>
          <div class="sh-empty-sub">${t('pattern.empty.sub')}</div>
        </div>`;
      return;
    }
    const handle = renderChunked({
      container: list,
      items: visible,
      render: renderPatternCard,
      prefixHtml: header,
    });
    chunkHandle = { abort: handle.abort };
  }

  const onClick = (e: Event): void => {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(
      '[data-pt-weapon],[data-pt-finish]',
    );
    if (!el || !container.contains(el)) return;
    e.preventDefault();
    const weapon = el.getAttribute('data-pt-weapon');
    const finish = el.getAttribute('data-pt-finish');
    if (weapon != null) {
      state.weapon = weapon;
      state.finish = 'all';
    } else if (finish != null) {
      state.finish = finish;
    }
    render();
  };

  const onChange = (e: Event): void => {
    const el = e.target as HTMLElement | null;
    if (!el || !container.contains(el)) return;
    if (el.matches('[data-pt-st]')) {
      state.stOnly = (el as HTMLInputElement).checked;
      render();
    } else if (el.matches('[data-pt-sort]')) {
      state.sort = (el as HTMLSelectElement).value as SortKey;
      render();
    }
  };

  container.addEventListener('click', onClick);
  container.addEventListener('change', onChange);
  render();

  return {
    destroy(): void {
      chunkHandle?.abort();
      chunkHandle = null;
      container.removeEventListener('click', onClick);
      container.removeEventListener('change', onChange);
    },
  };
}
