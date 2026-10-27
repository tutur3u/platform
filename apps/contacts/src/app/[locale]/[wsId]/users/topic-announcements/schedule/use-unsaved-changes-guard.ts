'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

/**
 * Protects unsaved schedule edits. Closing or reloading the tab triggers the
 * browser's own leave prompt; in-app links and month changes open the
 * caller's confirmation dialog through `pending` instead of navigating.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const router = useRouter();
  const [pending, setPending] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
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
      setPending(
        () => () => router.push(`${url.pathname}${url.search}${url.hash}`)
      );
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [isDirty, router]);

  /** Runs `action` now, or after confirmation when there are edits. */
  const guard = useCallback(
    (action: () => void) => {
      if (isDirty) setPending(() => action);
      else action();
    },
    [isDirty]
  );

  const confirm = useCallback(() => {
    const action = pending;
    setPending(null);
    action?.();
  }, [pending]);

  const cancel = useCallback(() => setPending(null), []);

  return { cancel, confirm, guard, isPending: pending !== null };
}
