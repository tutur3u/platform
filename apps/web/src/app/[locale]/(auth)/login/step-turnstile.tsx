'use client';

import type { IdentifyStepTurnstile } from './identify-step';
import { TurnstilePill } from './turnstile-pill';

/**
 * The security check on the code and password steps: the same quiet pill
 * and widget slot as the first step, shown only when a check is required.
 */
export function StepTurnstile({
  turnstile,
}: {
  turnstile: IdentifyStepTurnstile;
}) {
  if (!turnstile.state) return null;
  return (
    <TurnstilePill
      detail={turnstile.detail}
      onRetry={turnstile.onRetry}
      state={turnstile.state}
    >
      {turnstile.state === 'unavailable' ? null : turnstile.widget}
    </TurnstilePill>
  );
}
