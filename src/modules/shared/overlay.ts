/**
 * OverlayShell — injected DOM shell shared by all four content scripts.
 *
 * Layout (matches mockup-ui-skinhawk.html section 2 & 3):
 *   sh-root
 *     sh-header  (drag handle)
 *       sh-title (icon + name + mode-tag)
 *       sh-actions (minimize, close)
 *     sh-status  (single-line live status)
 *     sh-body    (filters, scan bar, results — written by caller)
 *
 * A floating `.sh-minbar` is created next to it. When minimized, the shell
 * collapses to a thin tab.
 */
import { OVERLAY_CSS } from './tokens';
import { patchSettings, getSettings } from './storage';

export type Mode = 'arbitrage' | 'rare';

export interface OverlayHandle {
  /** Root DOM node; remove to tear down. */
  root: HTMLElement;
  /** Body element — caller writes content here. */
  body: HTMLElement;
  /** Update header text. */
  setTitle(text: string): void;
  /** Update the single-line status (info/ok/err). */
  setStatus(text: string, kind?: 'info' | 'ok' | 'err' | ''): void;
  /** Minimize the shell. */
  minimize(): void;
  /** Restore from minimized. */
  restore(): void;
  /** Update the minbar count badge. */
  setMinbarCount(n: number): void;
  /** Destroy and remove from DOM. */
  destroy(): void;
}

interface ShellOptions {
  /** Unique id used for hostname-based persistence. */
  rootId: string;
  mode: Mode;
  /** Header title text (e.g. "Skinsight"). */
  title?: string;
  /** Mode tag label (e.g. "ARBITRAGE", "RARE STICKERS"). */
  modeLabel: string;
  /** Persist position/minimized state under this storage key. */
  persistKey?: string;
  /** Fires when the user closes the shell — destroys by default. */
  onClose?: () => void;
}

let _styleInjected = false;
function injectStyleOnce(): void {
  if (_styleInjected) return;
  const tag = document.createElement('style');
  tag.id = 'sh-style-tokens';
  tag.textContent = OVERLAY_CSS;
  document.documentElement.appendChild(tag);
  _styleInjected = true;
}

export function createOverlay(opts: ShellOptions): OverlayHandle {
  injectStyleOnce();

  // Tear down existing instance if same id.
  document.getElementById(opts.rootId)?.remove();
  document.getElementById(opts.rootId + '__minbar')?.remove();

  const root = document.createElement('div');
  root.id = opts.rootId;
  root.className = 'sh-root';
  root.innerHTML = `
    <div class="sh-header">
      <div class="sh-title">
        <span class="sh-title-icon">⌖</span>
        <span class="sh-title-text">${escape(opts.title ?? 'Skinsight')}</span>
        <span class="sh-mode-tag ${opts.mode === 'rare' ? 'rare' : ''}">${escape(opts.modeLabel)}</span>
      </div>
      <div class="sh-actions">
        <button class="sh-icon-btn" data-act="min" title="Minimize">−</button>
        <button class="sh-icon-btn" data-act="close" title="Close">×</button>
      </div>
    </div>
    <div class="sh-status" data-role="status"></div>
    <div class="sh-body" data-role="body"></div>
  `;
  document.documentElement.appendChild(root);

  const minbar = document.createElement('button');
  minbar.id = opts.rootId + '__minbar';
  minbar.className = 'sh-minbar';
  minbar.innerHTML = `
    <span class="sh-minbar-ico">⌖</span>
    <span class="sh-minbar-count" data-role="count">0</span>
    <span class="sh-minbar-sub">open</span>
  `;
  document.documentElement.appendChild(minbar);

  const body = root.querySelector<HTMLElement>('[data-role=body]')!;
  const statusEl = root.querySelector<HTMLElement>('[data-role=status]')!;
  const countEl = minbar.querySelector<HTMLElement>('[data-role=count]')!;

  // All listeners this shell attaches — including the drag handlers on `window`
  // — are registered with this signal so `destroy()` removes them in one shot.
  // Without it the window mousemove/mouseup leaked on every createOverlay (their
  // closures retained the detached `root`), accumulating across mode flips /
  // close-reopen. (v0.7 T1.b)
  const ac = new AbortController();
  const { signal } = ac;

  const handle: OverlayHandle = {
    root,
    body,
    setTitle(text) {
      root.querySelector<HTMLElement>('.sh-title-text')!.textContent = text;
    },
    setStatus(text, kind) {
      statusEl.textContent = text;
      statusEl.className = 'sh-status' + (kind ? ' ' + kind : '');
    },
    minimize() {
      root.classList.add('sh-minimized');
      minbar.style.display = 'flex';
      void persistPosition(opts.persistKey, { minimized: true });
    },
    restore() {
      root.classList.remove('sh-minimized');
      minbar.style.display = 'none';
      void persistPosition(opts.persistKey, { minimized: false });
    },
    setMinbarCount(n) {
      countEl.textContent = String(n);
    },
    destroy() {
      ac.abort(); // remove the window drag listeners (+ all shell listeners)
      root.remove();
      minbar.remove();
    },
  };

  // Header buttons.
  root
    .querySelector<HTMLElement>('[data-act=min]')!
    .addEventListener('click', () => handle.minimize(), { signal });
  root.querySelector<HTMLElement>('[data-act=close]')!.addEventListener(
    'click',
    () => {
      if (opts.onClose) opts.onClose();
      else handle.destroy();
    },
    { signal },
  );
  minbar.addEventListener('click', () => handle.restore(), { signal });

  // Drag.
  enableDrag(root, opts.persistKey, signal);

  // Hydrate from persisted state.
  if (opts.persistKey) {
    void hydratePosition(root, minbar, opts.persistKey);
  } else {
    minbar.style.display = 'none';
  }

  return handle;
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function enableDrag(root: HTMLElement, persistKey: string | undefined, signal: AbortSignal) {
  const header = root.querySelector<HTMLElement>('.sh-header');
  if (!header) return;
  let dragging = false;
  let sx = 0,
    sy = 0,
    ox = 0,
    oy = 0;
  header.addEventListener(
    'mousedown',
    (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.sh-icon-btn')) return;
      dragging = true;
      const r = root.getBoundingClientRect();
      sx = e.clientX;
      sy = e.clientY;
      ox = r.left;
      oy = r.top;
      e.preventDefault();
    },
    { signal },
  );
  // mousemove/mouseup live on `window` (drag continues outside the header) —
  // these are the ones that leaked; the signal removes them on destroy().
  window.addEventListener(
    'mousemove',
    (e) => {
      if (!dragging) return;
      const left = Math.max(0, ox + e.clientX - sx);
      const top = Math.max(0, oy + e.clientY - sy);
      root.style.left = left + 'px';
      root.style.top = top + 'px';
      root.style.right = 'auto';
    },
    { signal },
  );
  window.addEventListener(
    'mouseup',
    () => {
      if (!dragging) return;
      dragging = false;
      if (persistKey) {
        const r = root.getBoundingClientRect();
        void persistPosition(persistKey, { left: r.left, top: r.top });
      }
    },
    { signal },
  );
}

async function hydratePosition(root: HTMLElement, minbar: HTMLElement, key: string) {
  try {
    const s = await getSettings();
    const o = s.overlay[key];
    if (!o) {
      minbar.style.display = 'none';
      return;
    }
    if (typeof o.left === 'number' && typeof o.top === 'number') {
      root.style.left = o.left + 'px';
      root.style.top = o.top + 'px';
      root.style.right = 'auto';
    }
    if (o.minimized) {
      root.classList.add('sh-minimized');
      minbar.style.display = 'flex';
    } else {
      minbar.style.display = 'none';
    }
  } catch {
    minbar.style.display = 'none';
  }
}

async function persistPosition(
  key: string | undefined,
  patch: { left?: number; top?: number; minimized?: boolean },
): Promise<void> {
  if (!key) return;
  try {
    const s = await getSettings();
    const prev = s.overlay[key] ?? {};
    await patchSettings({ overlay: { ...s.overlay, [key]: { ...prev, ...patch } } });
  } catch {
    /* swallow */
  }
}
