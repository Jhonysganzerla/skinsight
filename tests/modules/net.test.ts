/**
 * fetchWithTimeout (v0.8 hardening) — aborts a hung request; passes a fast one
 * through and clears the timer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchWithTimeout } from '../../src/modules/shared/net';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('fetchWithTimeout', () => {
  it('rejects with AbortError when the response does not arrive in time', async () => {
    // fetch never resolves on its own; it only rejects when the signal aborts.
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    const p = fetchWithTimeout('https://example.test/x', {}, 1000);
    // Attach a catch synchronously so the rejection is never "unhandled".
    const assertion = expect(p).rejects.toThrowError(/abort/i);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('resolves and clears the timer when fetch returns before the timeout', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const body = new Response('ok', { status: 200 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(body);
    const res = await fetchWithTimeout('https://example.test/y', {}, 5000);
    expect(res.status).toBe(200);
    expect(clearSpy).toHaveBeenCalled();
  });

  it('forwards init but always attaches a signal', async () => {
    let seen: RequestInit | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init?: RequestInit) => {
      seen = init;
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    await fetchWithTimeout('https://example.test/z', { cache: 'no-store' }, 5000);
    expect(seen?.cache).toBe('no-store');
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
  });
});
