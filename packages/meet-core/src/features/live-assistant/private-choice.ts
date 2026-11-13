import type { PrivateMiraPolicy } from '@tuturuuu/internal-api';

export type PrivateChoice = 'continue' | 'mute' | 'leave';

/** Every reason a consent choice can fail has its own visible message. */
export type PrivateChoiceProblem =
  | 'not_connected'
  | 'not_admitted'
  | 'busy'
  | 'timeout'
  | 'unconfirmed'
  | 'unavailable'
  | 'failed';

export class PrivateChoiceError extends Error {
  constructor(readonly problem: PrivateChoiceProblem) {
    super(problem);
    this.name = 'PrivateChoiceError';
  }
}

/**
 * The room service answers 403 when this account has no live presence in the
 * meeting, and 409 while a private session still has to stop.
 */
export function privateChoiceProblem(error: unknown): PrivateChoiceProblem {
  if (error instanceof PrivateChoiceError) return error.problem;
  const status =
    error && typeof error === 'object' && 'status' in error
      ? Number(error.status)
      : Number.NaN;
  if (status === 403 || status === 404) return 'not_admitted';
  if (status === 409) return 'busy';
  return 'failed';
}

/**
 * Admits private input only for a server-confirmed Continue on an available
 * policy; any other confirmation result is a visible failure.
 */
export function confirmPrivateChoice(
  policy: Pick<PrivateMiraPolicy, 'available' | 'choice'>,
  requested: PrivateChoice
) {
  if (policy.choice?.choice !== requested)
    throw new PrivateChoiceError('unconfirmed');
  if (requested === 'continue' && !policy.available)
    throw new PrivateChoiceError('unavailable');
  return requested === 'continue';
}
