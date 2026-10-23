import { useEffect, useState } from 'react';

/** A notice deadline, not an admission decision or a network retry. */
export function useWaitDeadline(active: boolean, delayMs: number) {
  const [elapsed, setElapsed] = useState(false);
  if (!active && elapsed) setElapsed(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setElapsed(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
  return active && elapsed;
}
