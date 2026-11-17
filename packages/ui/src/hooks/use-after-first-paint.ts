'use client';

import { useEffect, useState } from 'react';

const IDLE_TIMEOUT_MS = 1500;
const NO_IDLE_API_DELAY_MS = 250;

/**
 * False during server rendering and the first client render, then true once
 * the browser is idle after the first paint (or after a short cap). Gate
 * queries that are not needed for the first content with it so the critical
 * reads are not competing with them.
 */
export function useAfterFirstPaint(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (!cancelled) setReady(true);
    };
    const idle =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(finish, { timeout: IDLE_TIMEOUT_MS })
        : undefined;
    const timer = window.setTimeout(
      finish,
      idle === undefined ? NO_IDLE_API_DELAY_MS : IDLE_TIMEOUT_MS
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (idle !== undefined && typeof cancelIdleCallback === 'function')
        cancelIdleCallback(idle);
    };
  }, []);

  return ready;
}
