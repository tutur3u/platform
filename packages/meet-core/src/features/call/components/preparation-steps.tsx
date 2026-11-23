'use client';

import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useWaitDeadline } from '../hooks/use-wait-deadline';
import type { CallLifecycle } from '../lib/call-state';

export const STEP_ADVANCE_MS = 2_500;
export const SLOW_HINT_MS = 8_000;

const STEP_KEYS = [
  'join_step_setup',
  'join_step_connecting',
  'join_step_ready',
] as const;

/**
 * The human step a waiting screen is on. A screen that is already joining
 * starts at Connecting; every screen moves one step on after a short pause.
 */
export function usePreparationStep(busy: boolean, lifecycle: CallLifecycle) {
  const advanced = useWaitDeadline(busy, STEP_ADVANCE_MS);
  const base = lifecycle === 'joining' ? 1 : 0;
  const step = Math.min(STEP_KEYS.length - 1, base + (advanced ? 1 : 0));
  return { step, key: STEP_KEYS[step] ?? STEP_KEYS[0] };
}

/** A quiet three-part bar. Fills ease in unless motion is reduced. */
export function PreparationProgress({ step }: { step: number }) {
  const t = useTranslations('meet.call');
  return (
    <div
      aria-hidden="true"
      data-testid="preparation-progress"
      className="mt-5 flex w-24 gap-1.5"
    >
      {STEP_KEYS.map((key, index) => (
        <span
          key={key}
          title={t(key)}
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
