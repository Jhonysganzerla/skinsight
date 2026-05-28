/**
 * virtual-list — windowing math + DOM contract.
 *
 * The vitest environment is `node` (no jsdom). `computeWindow` is a pure
 * function, tested directly. For `renderVirtualList` we mount a minimal fake
 * DOM (element factory with style/innerHTML/appendChild/getBoundingClientRect,
 * a scroll-root with listeners + clientHeight) plus stubs for
 * IntersectionObserver and requestAnimationFrame. This proves the core
 * contract — "only ~viewport+buffer nodes mounted for N items" — without
 * spinning up a full DOM.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeWindow, renderVirtualList } from '../../src/modules/shared/virtual-list';

describe('computeWindow', () => {
  const base = { viewportH: 600, rowHeight: 88, buffer: 10, total: 6000 };

  it('at the top: starts at 0, bounded by viewport + buffer', () => {
    const w = computeWindow({ ...base, scrolledIntoList: 0 });
    expect(w.start).toBe(0);
    // floor(600/88)=6 visible, +buffer 10 +1 = 17.
    expect(w.end).toBe(17);
  });

  it('mid-scroll: window slides and stays bounded', () => {
    const w = computeWindow({ ...base, scrolledIntoList: 88 * 100 });
    expect(w.start).toBe(90); // 100 - buffer
    expect(w.end - w.start).toBeLessThanOrEqual(
      Math.ceil(base.viewportH / base.rowHeight) + 2 * base.buffer + 1,
    );
    expect(w.start).toBeLessThanOrEqual(100);
    expect(w.end).toBeGreaterThan(100);
  });

  it('clamps the end at total near the bottom', () => {
    const w = computeWindow({ ...base, scrolledIntoList: 88 * 5995 });
    expect(w.end).toBe(6000);
    expect(w.start).toBeLessThan(6000);
  });

  it('negative scroll (list below viewport) clamps start to 0', () => {
    const w = computeWindow({ ...base, scrolledIntoList: -500 });
    expect(w.start).toBe(0);
  });

  it('empty data set yields an empty window', () => {
    expect(computeWindow({ ...base, total: 0, scrolledIntoList: 0 })).toEqual({ start: 0, end: 0 });
  });
});

/* ── fake DOM ───────────────────────────────────────────────────────── */

interface Rect {
  top: number;
}
interface FakeEl {
  tagName: string;
  className: string;
  style: Record<string, string>;
  innerHTML: string;
  children: FakeEl[];
  appendChild: (c: FakeEl) => void;
  getBoundingClientRect: () => Rect;
  ownerDocument: { createElement: (t: string) => FakeEl };
}

const scroll = { top: 0 };

function mkEl(tag: string, doc: { createElement: (t: string) => FakeEl }): FakeEl {
  const el: FakeEl = {
    tagName: tag,
    className: '',
    style: {},
    innerHTML: '',
    children: [],
    appendChild(c) {
      this.children.push(c);
    },
    getBoundingClientRect() {
      // The list element tracks scroll: its top moves up as we scroll down.
      return { top: this.className === 'sh-vlist' ? -scroll.top : 0 };
    },
    ownerDocument: doc,
  };
  return el;
}

interface FakeScrollRoot extends FakeEl {
  clientHeight: number;
  scrollTop: number;
  listeners: Record<string, Array<() => void>>;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
  fire: (type: string) => void;
}

function mkScrollRoot(doc: { createElement: (t: string) => FakeEl }): FakeScrollRoot {
  const base = mkEl('div', doc) as FakeEl;
  const root: FakeScrollRoot = {
    ...base,
    clientHeight: 600,
    scrollTop: 0,
    listeners: {},
    getBoundingClientRect() {
      return { top: 0 };
    },
    addEventListener(type, fn) {
      (this.listeners[type] ??= []).push(fn);
    },
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
    },
    fire(type) {
      for (const fn of this.listeners[type] ?? []) fn();
    },
  };
  return root;
}

function countMarkers(html: string): number {
  return (html.match(/<i data-i=/g) ?? []).length;
}
function findWindowHtml(container: FakeEl): string {
  const list = container.children.find((c) => c.className === 'sh-vlist');
  const win = list?.children.find((c) => c.className === 'sh-vlist-window');
  return win?.innerHTML ?? '';
}

describe('renderVirtualList (fake DOM)', () => {
  beforeEach(() => {
    scroll.top = 0;
    // Synchronous rAF so scroll → recompute runs inline.
    (globalThis as { requestAnimationFrame?: (cb: () => void) => number }).requestAnimationFrame = (
      cb,
    ) => {
      cb();
      return 0;
    };
    // Minimal IntersectionObserver stub.
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
      observe(): void {}
      disconnect(): void {}
    };
  });
  afterEach(() => {
    delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    vi.restoreAllMocks();
  });

  function mount(total: number) {
    const doc = { createElement: (t: string) => mkEl(t, doc) };
    const container = mkEl('div', doc);
    const scrollRoot = mkScrollRoot(doc);
    const items = Array.from({ length: total }, (_, i) => i);
    const handle = renderVirtualList({
      scrollRoot: scrollRoot as unknown as HTMLElement,
      container: container as unknown as HTMLElement,
      items,
      render: (n) => `<i data-i="${n}"></i>`,
      prefixHtml: '<header></header>',
    });
    return { container, scrollRoot, handle };
  }

  it('mounts only a bounded window for a 6000-item set', () => {
    const { container } = mount(6000);
    const html = findWindowHtml(container);
    expect(countMarkers(html)).toBeLessThanOrEqual(30);
    expect(html).toContain('data-i="0"');
    expect(html).not.toContain('data-i="100"');
  });

  it('re-mounts a different window on scroll', () => {
    const { container, scrollRoot } = mount(6000);
    scroll.top = 88 * 100; // scroll down ~100 rows
    scrollRoot.fire('scroll');
    const html = findWindowHtml(container);
    expect(html).toContain('data-i="100"');
    expect(html).not.toContain('data-i="0"');
    expect(countMarkers(html)).toBeLessThanOrEqual(30);
  });

  it('destroy() detaches the scroll listener', () => {
    const { scrollRoot, handle } = mount(6000);
    expect(scrollRoot.listeners['scroll']?.length).toBe(1);
    handle.destroy();
    expect(scrollRoot.listeners['scroll']?.length ?? 0).toBe(0);
  });
});
