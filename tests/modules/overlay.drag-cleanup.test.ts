/**
 * Regression for the v0.7 T1.b HIGH leak: enableDrag attached
 * window mousemove/mouseup listeners that destroy() never removed, so each
 * createOverlay leaked 2 window listeners (retaining the detached root).
 *
 * The fix registers them with an AbortController signal that destroy() aborts.
 * No jsdom here, so we stub a minimal document/window and assert the drag
 * listeners' signal is aborted after destroy() — and that two create→destroy
 * cycles leave zero live (non-aborted) drag listeners.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createOverlay } from '../../src/modules/shared/overlay';

interface RecordedListener {
  type: string;
  opts: AddEventListenerOptions | undefined;
}

function makeEl(): Record<string, unknown> {
  const el: Record<string, unknown> = {
    id: '',
    className: '',
    innerHTML: '',
    style: {},
    classList: { add() {}, remove() {} },
    appendChild(c: unknown) {
      return c;
    },
    querySelector() {
      return makeEl();
    },
    addEventListener() {},
    removeEventListener() {},
    remove() {},
    setAttribute() {},
    getBoundingClientRect() {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    },
  };
  return el;
}

let winListeners: RecordedListener[];

beforeEach(() => {
  winListeners = [];
  const doc = makeEl();
  doc['getElementById'] = () => null;
  doc['createElement'] = () => makeEl();
  doc['documentElement'] = makeEl();
  (globalThis as { document?: unknown }).document = doc;
  (globalThis as { window?: unknown }).window = {
    addEventListener(type: string, _fn: unknown, opts?: AddEventListenerOptions) {
      winListeners.push({ type, opts });
    },
    removeEventListener() {},
  };
});

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { window?: unknown }).window;
});

function dragSignals(): AbortSignal[] {
  return winListeners
    .filter((l) => l.type === 'mousemove' || l.type === 'mouseup')
    .map((l) => l.opts?.signal)
    .filter((s): s is AbortSignal => s instanceof AbortSignal);
}

describe('overlay drag-listener cleanup (v0.7 T1.b)', () => {
  it('registers window mousemove/mouseup with a signal and aborts it on destroy()', () => {
    const h = createOverlay({ rootId: 'sh-test', mode: 'rare', modeLabel: 'RARE' });

    const sigs = dragSignals();
    // both drag listeners present, each carrying a (not-yet-aborted) signal
    expect(winListeners.filter((l) => l.type === 'mousemove')).toHaveLength(1);
    expect(winListeners.filter((l) => l.type === 'mouseup')).toHaveLength(1);
    expect(sigs).toHaveLength(2);
    expect(sigs.every((s) => s.aborted)).toBe(false);

    h.destroy();
    // destroy() aborts the signal → the browser removes both window listeners
    expect(sigs.every((s) => s.aborted)).toBe(true);
  });

  it('two create→destroy cycles leave zero live drag listeners (no accumulation)', () => {
    createOverlay({ rootId: 'sh-test', mode: 'rare', modeLabel: 'RARE' }).destroy();
    createOverlay({ rootId: 'sh-test', mode: 'rare', modeLabel: 'RARE' }).destroy();

    const live = dragSignals().filter((s) => !s.aborted);
    expect(dragSignals()).toHaveLength(4); // 2 per cycle
    expect(live).toHaveLength(0); // all aborted
  });
});
