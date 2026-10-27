'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const SENTINEL = '__topicScheduleUnsaved';

interface PendingAction {
  run: () => void;
  /** Stays on this page (discard), so the extra history entry is dropped. */
  inPlace: boolean;
}

function pushSentinel() {
  window.history.pushState(
    { ...(window.history.state ?? {}), [SENTINEL]: true },
    '',
    window.location.href
  );
}

const onSentinel = () => Boolean(window.history.state?.[SENTINEL]);

/**
 * Whether Back leads to an earlier page in this tab. Uses the Navigation API
 * where available (`history.length` also counts Forward entries).
 */
function hasEarlierEntry() {
  const index = (
    window as { navigation?: { currentEntry?: { index?: number } | null } }
  ).navigation?.currentEntry?.index;
  return typeof index === 'number' ? index > 0 : window.history.length > 1;
}

/** Falls back to running the action if the Back traversal never reports. */
const LEAVE_FALLBACK_MS = 500;

/** Pops the extra entry first, then runs `action` on the page beneath it. */
function leaveSentinelThen(action: () => void) {
  if (!onSentinel()) {
    action();
    return;
  }
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', onPopState);
    action();
  };
  const onPopState = () => setTimeout(run, 0);
  window.addEventListener('popstate', onPopState, { once: true });
  window.history.back();
  setTimeout(run, LEAVE_FALLBACK_MS);
}

/**
 * Protects unsaved schedule edits:
 * - closing or reloading the tab triggers the browser's own leave prompt;
 * - in-app links and month changes open the caller's confirmation dialog
 *   (through `isPending`) instead of navigating;
 * - one step of browser Back: while there are edits and an earlier page
 *   exists, an extra history entry for this URL is kept on top (dropping any
 *   Forward entries). Leaving it means Back was pressed, so it is restored and
 *   the dialog asks first. Jumping several entries at once (the Back button's
 *   history menu) lands on another page and is not intercepted.
 *
 * Confirmed navigation pops the extra entry before navigating, so no stray
 * entry is left behind; discarding in place drops it as well.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const router = useRouter();
  // The effect must run once per dirty period: re-running it would drop and
  // re-push the history entry, which looks like a Back press.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const leavingRef = useRef(false);

  useEffect(() => {
    if (!isDirty) return;
    leavingRef.current = false;
    const guardedHref = window.location.href;
    const trapBack = hasEarlierEntry();
    if (trapBack) pushSentinel();

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const onPopState = () => {
      if (!trapBack || leavingRef.current || onSentinel()) return;
      if (window.location.href !== guardedHref) return;
      pushSentinel();
      setPending({ inPlace: false, run: () => window.history.back() });
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target === '_blank'
      ) {
        return;
      }
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setPending({
        inPlace: false,
        run: () =>
          routerRef.current.push(`${url.pathname}${url.search}${url.hash}`),
      });
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onClick, true);
      // Saved or discarded in place: drop the extra entry again.
      if (!leavingRef.current && onSentinel()) window.history.back();
    };
  }, [isDirty]);

  /**
   * Runs `action` now, or after confirmation when there are edits. Pass
   * `inPlace` for actions that stay on the page (discarding edits).
   */
  const guard = useCallback(
    (action: () => void, { inPlace = false }: { inPlace?: boolean } = {}) => {
      if (isDirty) setPending({ inPlace, run: action });
      else action();
    },
    [isDirty]
  );

  const confirm = useCallback(() => {
    const action = pending;
    setPending(null);
    if (!action) return;
    if (action.inPlace) {
      action.run();
      return;
    }
    leavingRef.current = true;
    leaveSentinelThen(action.run);
  }, [pending]);

  const cancel = useCallback(() => setPending(null), []);

  return { cancel, confirm, guard, isPending: pending !== null };
}
