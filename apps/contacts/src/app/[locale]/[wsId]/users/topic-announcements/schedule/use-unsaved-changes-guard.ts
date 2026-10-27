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

/**
 * Protects unsaved schedule edits:
 * - closing or reloading the tab triggers the browser's own leave prompt;
 * - in-app links and month changes open the caller's confirmation dialog
 *   (through `isPending`) instead of navigating;
 * - Back/Forward: while there are edits an extra history entry for the same
 *   URL is kept on top (which also drops any Forward entries). Leaving it
 *   means the user pressed Back, so it is restored and the dialog asks
 *   first; confirming goes back past it.
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
    pushSentinel();

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const onPopState = () => {
      if (leavingRef.current || window.history.state?.[SENTINEL]) return;
      pushSentinel();
      setPending({ inPlace: false, run: () => window.history.go(-2) });
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
      if (!leavingRef.current && window.history.state?.[SENTINEL]) {
        window.history.back();
      }
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
    leavingRef.current = !action.inPlace;
    action.run();
  }, [pending]);

  const cancel = useCallback(() => setPending(null), []);

  return { cancel, confirm, guard, isPending: pending !== null };
}
