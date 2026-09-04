'use client';

import { useEffect } from 'react';

const DEFERRED_AUTH_SURFACE_TIMEOUT_MS = 3000;

export function useDeferredAuthSurfaceRecovery(
  enabled: boolean,
  initialized: boolean,
  readyForAuth: boolean,
  setRedirectingAfterAuthState: (value: boolean) => void,
  setReadyForAuth: (value: boolean) => void
) {
  useEffect(() => {
    if (!enabled || initialized || readyForAuth) return;

    const timeout = window.setTimeout(() => {
      setRedirectingAfterAuthState(false);
      setReadyForAuth(true);
    }, DEFERRED_AUTH_SURFACE_TIMEOUT_MS);

    return () => window.clearTimeout(timeout);
  }, [
    enabled,
    initialized,
    readyForAuth,
    setRedirectingAfterAuthState,
    setReadyForAuth,
  ]);
}
