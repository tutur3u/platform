'use client';

import { useRef } from 'react';

/**
 * Milliseconds to add to this device's clock to read the room's clock. It is
 * measured each time the room sends a new `serverNow`, so a fast or slow
 * device still agrees with the room on timers and deadlines.
 */
export function useServerClockSkew(serverNow: string | null | undefined) {
  const skew = useRef(0);
  const seen = useRef<string | null | undefined>(null);
  if (serverNow !== seen.current) {
    seen.current = serverNow;
    const server = serverNow ? Date.parse(serverNow) : Number.NaN;
    skew.current = Number.isFinite(server) ? server - Date.now() : 0;
  }
  return skew.current;
}
