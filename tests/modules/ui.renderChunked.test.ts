/**
 * renderChunked() — chunked DOM render with abort.
 *
 * The vitest default environment is `node`, so we mount a minimal
 * happy-dom-style stub: a fake container with an `innerHTML` setter and
 * `appendChild`, plus a `Range#createContextualFragment` shim. This lets us
 * test the scheduling + abort contract without spinning up jsdom for the
 * whole file.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderChunked } from '../../src/modules/shared/ui';

interface FakeFragment {
  __html: string;
}
interface FakeContainer {
  innerHTML: string;
  ownerDocument: { createRange: () => FakeRange };
  appendChild: (n: FakeFragment) => void;
}
interface FakeRange {
  selectNodeContents: () => void;
  collapse: () => void;
  createContextualFragment: (html: string) => FakeFragment;
}

function mkContainer(): FakeContainer {
  const c: FakeContainer = {
    innerHTML: '',
    ownerDocument: {
      createRange(): FakeRange {
        return {
          selectNodeContents() {},
          collapse() {},
          createContextualFragment(html) {
            return { __html: html };
          },
        };
      },
    },
    appendChild(n) {
      this.innerHTML += n.__html;
    },
  };
  return c;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('renderChunked', () => {
  it('writes the prefix and one chunk synchronously on call', () => {
    const c = mkContainer();
    renderChunked({
      container: c as unknown as HTMLElement,
      items: Array.from({ length: 120 }, (_, i) => i),
      render: (n) => `<i>${n}</i>`,
      prefixHtml: '<h1>R</h1>',
      chunkSize: 50,
    });
    // Prefix + first chunk (50) before any timer fires.
    expect(c.innerHTML.startsWith('<h1>R</h1>')).toBe(true);
    expect(c.innerHTML).toContain('<i>0</i>');
    expect(c.innerHTML).toContain('<i>49</i>');
    expect(c.innerHTML).not.toContain('<i>50</i>');
  });

  it('flushes the remaining chunks across scheduled ticks', async () => {
    const c = mkContainer();
    const h = renderChunked({
      container: c as unknown as HTMLElement,
      items: Array.from({ length: 120 }, (_, i) => i),
      render: (n) => `<i>${n}</i>`,
      chunkSize: 50,
    });
    await vi.advanceTimersByTimeAsync(10);
    await h.done;
    expect(c.innerHTML).toContain('<i>119</i>');
  });

  it('abort() stops mid-render — later chunks are not appended', async () => {
    const c = mkContainer();
    const h = renderChunked({
      container: c as unknown as HTMLElement,
      items: Array.from({ length: 200 }, (_, i) => i),
      render: (n) => `<i>${n}</i>`,
      chunkSize: 50,
    });
    // First chunk landed synchronously.
    expect(c.innerHTML).toContain('<i>49</i>');
    expect(c.innerHTML).not.toContain('<i>50</i>');
    h.abort();
    await vi.advanceTimersByTimeAsync(10);
    await h.done;
    // After abort: still 50 items in the buffer, no later chunks.
    expect(c.innerHTML).not.toContain('<i>50</i>');
    expect(c.innerHTML).not.toContain('<i>199</i>');
  });

  it('empty items + prefix still write the prefix', () => {
    const c = mkContainer();
    renderChunked({
      container: c as unknown as HTMLElement,
      items: [],
      render: () => 'X',
      prefixHtml: '<header />',
    });
    expect(c.innerHTML).toBe('<header />');
  });
});
