import { useEffect, useState } from 'react';

/** How long a Run may stay queued or running before the sandbox note appears. */
export const SLOW_START_MS = 3000;

/**
 * True once `active` has held for the delay, on the client clock only. It
 * clears the moment `active` ends, so a finished, failed or stopped Run never
 * leaves it behind, and a new Run starts its own delay.
 */
export function useSlowStartNotice(active: boolean, delayMs = SLOW_START_MS) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
  return active && shown;
}
