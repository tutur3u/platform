'use client';

import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { resolveTurnstileClientState } from '@tuturuuu/cloudflare/turnstile/client';
import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Turnstile state for one feedback form. The intake always verifies a token,
 * so the widget is required whenever a site key is configured and the form
 * cannot submit without one. A token is single use: `reset` clears it and
 * asks the widget for a new challenge.
 */
export function useFeedbackTurnstile() {
  const state = useMemo(
    () => resolveTurnstileClientState({ devMode: false }),
    []
  );
  const widgetRef = useRef<TurnstileInstance>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const onSuccess = useCallback((next: string) => {
    setToken(next);
    setFailed(false);
  }, []);
  const onExpire = useCallback(() => setToken(null), []);
  const onError = useCallback(() => {
    setToken(null);
    setFailed(true);
  }, []);
  const reset = useCallback(() => {
    setToken(null);
    widgetRef.current?.reset();
  }, []);

  return {
    siteKey: state.siteKey,
    canRender: state.canRenderWidget,
    widgetRef,
    token,
    failed,
    onSuccess,
    onExpire,
    onError,
    reset,
  };
}
