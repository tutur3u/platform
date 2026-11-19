/**
 * A browser-local signal that the signed-in session is about to end or
 * change (sign-out, account switch). Client modules that keep per-user data
 * in browser storage listen for it and clear that data before navigation.
 */
export const SESSION_ENDING_EVENT = 'tuturuuu:session-ending';

/** Announces that the current session is ending. Safe to call on the server. */
export function announceSessionEnding() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(SESSION_ENDING_EVENT));
  } catch {
    // A listener failure must never block sign-out.
  }
}

/** Subscribes to the session-ending signal; returns an unsubscribe function. */
export function onSessionEnding(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(SESSION_ENDING_EVENT, listener);
  return () => window.removeEventListener(SESSION_ENDING_EVENT, listener);
}
