/**
 * Token-bucket rate limiter. Lives in the service worker so a single
 * shared budget is enforced across all tabs that hit a given API.
 *
 * Semantics:
 *  - `refillPerMs` tokens are continuously added (clamped to `capacity`).
 *  - `acquire()` returns a Promise that resolves when one token is
 *     available; multiple concurrent callers are served FIFO.
 *  - `pause(ms)` drops the current bucket to zero and blocks refill for
 *     `ms` (used when the upstream API returns 429).
 *
 * Pure module — no chrome.* dependency, so unit-tested with fake timers.
 */

export interface TokenBucketOpts {
  /** Tokens regenerated per millisecond. e.g. 45 req/min → 45/60000 = 0.00075. */
  refillPerMs: number;
  /** Max tokens the bucket can hold (burst size). */
  capacity: number;
}

export class TokenBucket {
  private tokens: number;
  private last: number;
  private pausedUntil = 0;
  private queue: Array<() => void> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: TokenBucketOpts) {
    this.tokens = opts.capacity;
    this.last = Date.now();
  }

  /** Wait until a token is available, then consume it. */
  acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.drain();
    });
  }

  /** Drop bucket to 0 and freeze refill for `durationMs`. Used on HTTP 429. */
  pause(durationMs: number): void {
    const now = Date.now();
    this.pausedUntil = Math.max(this.pausedUntil, now + durationMs);
    this.tokens = 0;
    this.last = this.pausedUntil;
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length) this.scheduleNext();
  }

  /** Visible for telemetry / tests. */
  inspect(): { tokens: number; pausedFor: number; queueLength: number } {
    this.refill();
    return {
      tokens: this.tokens,
      pausedFor: Math.max(0, this.pausedUntil - Date.now()),
      queueLength: this.queue.length,
    };
  }

  private refill(now: number = Date.now()): void {
    if (now < this.pausedUntil) {
      // Treat the pause as the new baseline so we don't burst when it lifts.
      this.last = this.pausedUntil;
      return;
    }
    const elapsed = now - this.last;
    if (elapsed > 0) {
      this.tokens = Math.min(this.opts.capacity, this.tokens + elapsed * this.opts.refillPerMs);
      this.last = now;
    }
  }

  private drain(): void {
    this.refill();
    while (this.queue.length && this.tokens >= 1 && Date.now() >= this.pausedUntil) {
      this.tokens -= 1;
      const next = this.queue.shift();
      if (next) next();
    }
    if (this.queue.length) this.scheduleNext();
  }

  private scheduleNext(): void {
    if (this.timer != null) return;
    const now = Date.now();
    const pauseWait = Math.max(0, this.pausedUntil - now);
    const tokenWait = this.tokens >= 1 ? 0 : Math.ceil((1 - this.tokens) / this.opts.refillPerMs);
    const waitMs = Math.max(20, Math.max(tokenWait, pauseWait));
    this.timer = setTimeout(() => {
      this.timer = null;
      this.drain();
    }, waitMs);
  }
}

/** CSFloat-tuned bucket: 45 req/min steady, burst of 10. */
export function csfloatBucket(): TokenBucket {
  return new TokenBucket({ refillPerMs: 45 / 60_000, capacity: 10 });
}

/**
 * Steam Community Market bucket: 15 req/min, no burst beyond the minute's
 * allotment. Steam rate-limits ~20 req/min/IP and bans on abuse (briefing
 * §9 DON'T #4), so capacity == the per-minute budget keeps us well under.
 */
export function steamBucket(): TokenBucket {
  return new TokenBucket({ refillPerMs: 15 / 60_000, capacity: 15 });
}
