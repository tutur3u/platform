/**
 * Shows the public profile address (`/u/<username>`) in the address bar while
 * the settings dialog's Public profile tab is open, without navigating.
 *
 * Entering replaces the current history entry's URL and tags its state with a
 * per-page nonce; leaving restores the URL it replaced. Back pops to the entry
 * before the dialog opened, which carries no tag, so the dialog closes. A
 * reload of `/u/<username>` loses the in-memory nonce and renders the full
 * public page. The address only changes when the profile URL shares the
 * current origin; other origins keep their `?settingsTab=` address.
 */

const STATE_KEY = '__tuturuuuPublicProfileAddress';

type ActiveAddress = { nonce: string; returnTo: string };

let active: ActiveAddress | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function historyState(): Record<string, unknown> {
  const state = window.history.state;
  return state && typeof state === 'object' ? { ...state } : {};
}

function createNonce() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Whether the current history entry shows the public profile address. */
export function isPublicProfileAddressActive(): boolean {
  if (typeof window === 'undefined' || !active) return false;
  return historyState()[STATE_KEY] === active.nonce;
}

export function subscribePublicProfileAddress(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

/**
 * Puts `profileUrl` in the address bar when it shares this page's origin.
 * Returns whether the address changed.
 */
export function enterPublicProfileAddress(profileUrl: string): boolean {
  if (typeof window === 'undefined') return false;
  if (isPublicProfileAddressActive()) return true;
  let target: URL;
  try {
    target = new URL(profileUrl, window.location.href);
  } catch {
    return false;
  }
  if (target.origin !== window.location.origin) return false;

  const { pathname, search, hash } = window.location;
  const nonce = createNonce();
  active = { nonce, returnTo: `${pathname}${search}${hash}` };
  window.history.replaceState(
    { ...historyState(), [STATE_KEY]: nonce },
    '',
    `${target.pathname}${target.search}`
  );
  notify();
  return true;
}

/** Restores the address the profile replaced; a no-op when it is not shown. */
export function leavePublicProfileAddress(): void {
  if (typeof window === 'undefined') return;
  const current = active;
  if (!current || !isPublicProfileAddressActive()) {
    active = null;
    return;
  }
  active = null;
  const { [STATE_KEY]: _removed, ...state } = historyState();
  window.history.replaceState(state, '', current.returnTo);
  notify();
}
