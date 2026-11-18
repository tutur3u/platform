'use client';

import {
  createTurnstileRetryScheduler,
  onTurnstilePageRestore,
} from '@tuturuuu/cloudflare/turnstile/client';
import { useEffect, useMemo } from 'react';

/**
 * Bounded Turnstile recovery for a widget. Safari reports transient
 * challenge failures (600010) that Cloudflare retries itself; resetting from
 * the error callback restarts the challenge in a loop, so resets wait for a
 * growing delay. A back/forward cache restore drops the stale token.
 */
export function useTurnstileRetry(reset: () => void, onRestore: () => void) {
  const scheduler = useMemo(
    () => createTurnstileRetryScheduler({ reset }),
    [reset]
  );
  useEffect(() => {
    const stop = onTurnstilePageRestore(onRestore);
    return () => {
      stop();
      scheduler.cancel();
    };
  }, [onRestore, scheduler]);
  return scheduler;
}
