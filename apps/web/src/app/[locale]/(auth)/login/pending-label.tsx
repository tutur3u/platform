'use client';

import { useEffect, useState } from 'react';

/** Delays after which a pending action moves to its next, more specific label. */
const DEFAULT_PHASE_DELAYS_MS = [2000, 5000] as const;

/**
 * Advances 0 → 1 → 2 while `active` stays true, so a slow action explains
 * what it is doing instead of sitting still. Resets when it stops.
 */
export function usePendingPhase(
  active: boolean,
  delays: readonly number[] = DEFAULT_PHASE_DELAYS_MS
) {
  const [phase, setPhase] = useState(0);

  // Depends on the delay values, not the array identity, so an inline array
  // from a caller never restarts the timers on every render.
  const delayKey = delays.join(',');

  useEffect(() => {
    if (!active) {
      setPhase(0);
      return;
    }
    const timers = delayKey
      .split(',')
      .map(Number)
      .map((delay, index) =>
        globalThis.setTimeout(() => setPhase(index + 1), delay)
      );
    return () => {
      for (const timer of timers) globalThis.clearTimeout(timer);
    };
  }, [active, delayKey]);

  return active ? phase : 0;
}

/**
 * Stacks every phase label in one grid cell and shows only the current one,
 * so the button keeps the width of its longest label and never shifts.
 */
export function PendingLabel({
  labels,
  phase,
}: {
  labels: readonly string[];
  phase: number;
}) {
  const current = Math.min(phase, labels.length - 1);

  return (
    <span className="inline-grid min-w-0">
      {labels.map((label, index) => (
        <span
          aria-hidden={index !== current}
          className={`col-start-1 row-start-1 truncate ${
            index === current ? '' : 'invisible'
          }`}
          key={index}
        >
          {label}
        </span>
      ))}
    </span>
  );
}
