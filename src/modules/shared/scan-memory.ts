/**
 * Scan memory (v0.10): seen-set diffing + last-scan snapshots.
 *
 * Two primitives, both in chrome.storage.local, both capped:
 *
 *  - SEEN SET (`seen:<scope>`) — keys of every result the user has already
 *    been shown, per site×submode scope. `flagNew()` marks results absent
 *    from the set with `isNew: true` (the "NOVO" badge) and persists the
 *    merged set. The FIRST scan of a scope is treated as a baseline: nothing
 *    is flagged (everything would be "new" — pure noise), the set is seeded.
 *
 *  - SNAPSHOT (`last_scan:<scope>`) — the last completed result set, so a
 *    60-second scan (and its throttle budget) survives a tab close. Restored
 *    via the banner offered on overlay mount while fresher than the TTL.
 *
 * Both follow the storage discipline established by hits (HITS_MAX_ENTRIES /
 * runHitsGc): hard caps, never throw, GC hook for the service worker.
 */

const SEEN_MAX = 5000;
const SNAP_MAX_ITEMS = 500;
export const SNAP_TTL_MS = 24 * 60 * 60 * 1000;

const seenKey = (scope: string): string => `seen:${scope}`;
const snapKey = (scope: string): string => `last_scan:${scope}`;

/** Stable identity for a scan result. Prefers the marketplace asset id;
 *  falls back to name#seed (the same shape pattern-query dedupes with). */
export function resultKey(it: {
  id?: string | number;
  marketHashName?: string;
  name?: string;
  paintSeed?: number | null;
}): string {
  const id = it.id != null ? String(it.id) : '';
  if (id) return `id:${id}`;
  return `nm:${it.marketHashName || it.name || ''}#${it.paintSeed ?? ''}`;
}

async function readSeen(scope: string): Promise<string[]> {
  try {
    const r = (await chrome.storage.local.get(seenKey(scope))) as Record<string, unknown>;
    const v = r[seenKey(scope)];
    return Array.isArray(v) ? (v.filter((k) => typeof k === 'string') as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Mark the results NOT in the scope's seen set with `isNew: true`, merge the
 * new keys into the set (insertion-ordered, oldest evicted past SEEN_MAX) and
 * persist. Returns how many were flagged. Never throws.
 */
export async function flagNew<T extends { isNew?: boolean }>(
  scope: string,
  items: T[],
  keyOf: (it: T) => string,
): Promise<number> {
  try {
    const prev = await readSeen(scope);
    const baseline = prev.length === 0; // first scan: seed silently, no badges
    const seen = new Set(prev);
    const freshKeys: string[] = [];
    let flagged = 0;
    for (const it of items) {
      const k = keyOf(it);
      if (!seen.has(k)) {
        seen.add(k);
        freshKeys.push(k);
        it.isNew = !baseline;
        if (!baseline) flagged += 1;
      } else {
        it.isNew = false;
      }
    }
    if (freshKeys.length > 0) {
      const merged = prev.concat(freshKeys);
      const capped = merged.length > SEEN_MAX ? merged.slice(merged.length - SEEN_MAX) : merged;
      await chrome.storage.local.set({ [seenKey(scope)]: capped });
    }
    return flagged;
  } catch {
    return 0;
  }
}

export interface ScanSnapshot<T> {
  ts: number;
  results: T[];
  /** True when the saved set was cut at SNAP_MAX_ITEMS. */
  truncated: boolean;
}

/** Persist the scope's last completed scan (capped). Never throws. */
export async function saveSnapshot(scope: string, results: unknown[]): Promise<void> {
  try {
    const truncated = results.length > SNAP_MAX_ITEMS;
    const snap: ScanSnapshot<unknown> = {
      ts: Date.now(),
      results: truncated ? results.slice(0, SNAP_MAX_ITEMS) : results,
      truncated,
    };
    await chrome.storage.local.set({ [snapKey(scope)]: snap });
  } catch {
    /* quota — the live in-memory results still serve this session */
  }
}

/** Load the scope's snapshot if present and fresher than SNAP_TTL_MS. */
export async function loadSnapshot<T>(scope: string): Promise<ScanSnapshot<T> | null> {
  try {
    const r = (await chrome.storage.local.get(snapKey(scope))) as Record<string, unknown>;
    const snap = r[snapKey(scope)] as ScanSnapshot<T> | undefined;
    if (!snap || typeof snap.ts !== 'number' || !Array.isArray(snap.results)) return null;
    if (Date.now() - snap.ts > SNAP_TTL_MS) return null;
    return snap;
  } catch {
    return null;
  }
}

/** "5 min" / "3 h" — compact age label for the restore banner. */
export function agoLabel(ts: number, now = Date.now()): string {
  const mins = Math.max(1, Math.round((now - ts) / 60_000));
  if (mins < 60) return `${mins} min`;
  return `${Math.round(mins / 60)} h`;
}

/**
 * GC for the service worker (startup/install): drop expired snapshots.
 * Seen sets are self-capping and deliberately long-lived — left alone.
 */
export async function runScanMemoryGc(now = Date.now()): Promise<number> {
  try {
    const all = (await chrome.storage.local.get(null)) as Record<string, unknown>;
    const stale: string[] = [];
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith('last_scan:')) continue;
      const ts = (value as { ts?: unknown } | null)?.ts;
      if (typeof ts !== 'number' || now - ts > SNAP_TTL_MS) stale.push(key);
    }
    if (stale.length > 0) await chrome.storage.local.remove(stale);
    return stale.length;
  } catch {
    return 0;
  }
}
