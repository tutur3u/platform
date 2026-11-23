'use client';

import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import { useWaitDeadline } from '../hooks/use-wait-deadline';

export const STEP_ADVANCE_MS = 2_500;
export const SLOW_HINT_MS = 8_000;

const STEP_KEYS = [
  'join_step_setup',
  'join_step_connecting',
  'join_step_ready',
] as const;

/**
 * The human step a waiting screen is on. It moves one step on after a short
 * pause and never goes back, even when `busy` toggles during a refetch.
 */
export function usePreparationStep(busy: boolean) {
  const second = useWaitDeadline(busy, STEP_ADVANCE_MS);
  const third = useWaitDeadline(busy, STEP_ADVANCE_MS * 2);
  const [latched, setLatched] = useState(0);
  const step = Math.max(latched, third ? 2 : second ? 1 : 0);
  if (step !== latched) setLatched(step);
  return { step, key: STEP_KEYS[step] ?? STEP_KEYS[0] };
}

/** A quiet three-part bar. Fills ease in unless motion is reduced. */
export function PreparationProgress({ step }: { step: number }) {
  return (
    <div
      aria-hidden="true"
      data-testid="preparation-progress"
      className="mt-5 flex w-24 gap-1.5"
    >
      {STEP_KEYS.map((key, index) => (
        <span
          key={key}
          className={cn(
            'h-1 flex-1 rounded-full bg-muted motion-safe:transition-colors motion-safe:duration-500',
            index <= step && 'bg-primary/60',
            index === step && 'motion-safe:animate-pulse'
          )}
        />
      ))}
    </div>
  );
}
