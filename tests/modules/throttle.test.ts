/**
 * Token-bucket throttle tests with fake timers.
 *
 * We exercise the bucket in 3 scenarios:
 *  - Steady acquire rate matches the configured refill (≈ 45 req/min).
 *  - Burst of `capacity` resolves immediately, then subsequent acquires wait.
 *  - pause() drains tokens and blocks acquires for the requested duration,
 *    then refill resumes from zero.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TokenBucket } from '../../src/modules/shared/throttle';

const RATE_PER_MS = 45 / 60_000; // 45 req/min

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-26T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TokenBucket', () => {
  it('burst: capacity tokens acquire immediately', async () => {
    const b = new TokenBucket({ refillPerMs: RATE_PER_MS, capacity: 10 });
    const acquired: number[] = [];
    const promises = Array.from({ length: 10 }, (_, i) =>
      b.acquire().then(() => acquired.push(i)),
    );
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all(promises);
    expect(acquired).toHaveLength(10);
  });

  it('11th acquire waits ~1333 ms (one refill period at 45/min)', async () => {
    const b = new TokenBucket({ refillPerMs: RATE_PER_MS, capacity: 10 });
    // Drain the burst.
    await Promise.all(Array.from({ length: 10 }, () => b.acquire()));

    let elevenResolved = false;
    const t0 = Date.now();
    const eleven = b.acquire().then(() => {
      elevenResolved = true;
    });

    // 1000 ms in, still waiting.
    await vi.advanceTimersByTimeAsync(1000);
    expect(elevenResolved).toBe(false);

    // After ~1333 ms total, a token should be available.
    await vi.advanceTimersByTimeAsync(400);
    await eleven;
    expect(elevenResolved).toBe(true);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1333);
    expect(Date.now() - t0).toBeLessThan(1600);
  });

  it('steady acquire rate matches 45/min after the initial burst', async () => {
    const b = new TokenBucket({ refillPerMs: RATE_PER_MS, capacity: 10 });
    const start = Date.now();
    // 45 acquires: first 10 burst, next 35 must take ≥ 35 * 1333 ≈ 46_655 ms.
    const acquired: number[] = [];
    const all = Promise.all(
      Array.from({ length: 45 }, (_, i) => b.acquire().then(() => acquired.push(i))),
    );

    // Sweep time forward in 1-minute chunks until all resolve.
    for (let i = 0; i < 120 && acquired.length < 45; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    await all;
    const elapsedSec = (Date.now() - start) / 1000;
    // 45 requests at 45/min = 60 s minus the 10-token burst that consumes
    // ~0 s up front → ~46 s steady. Allow [40, 70] s slack.
    expect(elapsedSec).toBeGreaterThanOrEqual(40);
    expect(elapsedSec).toBeLessThanOrEqual(70);
  });

  it('pause(30s) drains tokens and blocks acquires for the duration', async () => {
    const b = new TokenBucket({ refillPerMs: RATE_PER_MS, capacity: 10 });
    // Pause immediately while bucket is full.
    b.pause(30_000);
    let resolved = false;
    const p = b.acquire().then(() => {
      resolved = true;
    });

    // 29 s in: still paused.
    await vi.advanceTimersByTimeAsync(29_000);
    expect(resolved).toBe(false);

    // ~30 s + one refill window — should resolve.
    await vi.advanceTimersByTimeAsync(2500);
    await p;
    expect(resolved).toBe(true);
  });

  it('inspect() reports state during a pause', async () => {
    const b = new TokenBucket({ refillPerMs: RATE_PER_MS, capacity: 10 });
    b.pause(10_000);
    const s1 = b.inspect();
    expect(s1.tokens).toBe(0);
    expect(s1.pausedFor).toBeGreaterThan(9_000);
    expect(s1.pausedFor).toBeLessThanOrEqual(10_000);
    expect(s1.queueLength).toBe(0);
  });
});
