/**
 * Shows the public profile address (`/u/<username>`) in the address bar while
 * the settings dialog's Public profile tab is open, without navigating.
 *
 * Entering replaces the current history entry's URL and tags its state with
 * this page load's session id and the URL it replaced (`returnTo`). The tag
 * alone says the dialog is open, so history traversal needs no extra
 * bookkeeping: Back pops to the entry before the dialog opened, which carries
 * no tag, so the dialog closes; Forward returns to the tagged entry, so the
 * dialog reopens on the Public profile tab. Leaving restores `returnTo`. A
 * tag from an earlier page load has another session id and is inert, so a
 * reload of `/u/<username>` renders the full public page. The address only
 * changes when the profile URL shares the current origin; other origins keep
 * their `?settingsTab=` address.
 */

const STATE_KEY = '__tuturuuuPublicProfileAddress';

type AddressTag = { returnTo: string; session: string };

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

// Workers refuse random values in module scope, so the id is minted on first
// use and then stays fixed for the rest of the page load.
let pageSession: string | undefined;

function getPageSession() {
  pageSession ??= createNonce();
  return pageSession;
}

/** The current entry's tag when it was written by this page load. */
function currentTag(): AddressTag | null {
  if (typeof window === 'undefined') return null;
  const tag = historyState()[STATE_KEY] as Partial<AddressTag> | undefined;
  if (!tag || typeof tag !== 'object') return null;
  if (tag.session !== getPageSession() || typeof tag.returnTo !== 'string') {
    return null;
  }
  return tag as AddressTag;
}

/** Whether the current history entry shows the public profile address. */
export function isPublicProfileAddressActive(): boolean {
  return currentTag() !== null;
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
  const tag: AddressTag = {
    returnTo: `${pathname}${search}${hash}`,
    session: getPageSession(),
  };
  window.history.replaceState(
    { ...historyState(), [STATE_KEY]: tag },
    '',
    `${target.pathname}${target.search}`
  );
  notify();
  return true;
}

/** Restores the address the profile replaced; a no-op when it is not shown. */
export function leavePublicProfileAddress(): void {
  if (typeof window === 'undefined') return;
  const tag = currentTag();
  if (!tag) return;
  const { [STATE_KEY]: _removed, ...state } = historyState();
  window.history.replaceState(state, '', tag.returnTo);
  notify();
}
