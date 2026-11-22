/**
 * The quiet status pill shown for the sign-in security check. Presentation
 * only: it reads the existing Turnstile state and never decides whether a
 * token is required or present.
 */
export type TurnstilePillState =
  /** The deployment requires a check but has no usable widget. */
  | 'unavailable'
  /** The widget is loading or running its challenge. */
  | 'checking'
  /** A token is held for the next attempt. */
  | 'passed'
  /** The widget reported an error; the user can retry. */
  | 'failed';

export function resolveTurnstilePillState({
  canRenderWidget,
  error,
  isRequired,
  siteKey,
  token,
}: {
  canRenderWidget: boolean;
  error?: string | null;
  isRequired: boolean;
  siteKey?: string | null;
  token?: string | null;
}): TurnstilePillState | null {
  if (!isRequired) return null;
  if (!canRenderWidget || !siteKey) return 'unavailable';
  if (error) return 'failed';
  if (token) return 'passed';
  return 'checking';
}

export const TURNSTILE_PILL_LABEL_KEYS = {
  checking: 'login.turnstile_checking',
  failed: 'login.turnstile_failed',
  passed: 'login.turnstile_passed',
  unavailable: 'login.turnstile_unavailable',
} as const satisfies Record<TurnstilePillState, string>;
