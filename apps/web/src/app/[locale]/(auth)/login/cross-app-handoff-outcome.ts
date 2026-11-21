import { getCrossAppPkceParams } from '@/lib/auth/cross-app-pkce';
import type { ReturnUrlFailureKind } from './invalid-return-url-warning';

export type CrossAppHandoffResponse = {
  code?: string;
  error?: string;
  returnUrl?: string;
  targetApp?: string;
} | null;

export type CrossAppHandoffOutcome =
  | { kind: 'redirect'; returnUrl: string }
  | { kind: 'mfa_step_up' }
  | { kind: 'failure'; failure: ReturnUrlFailureKind };

/**
 * Decides what the login page does with a `POST /api/v1/auth/cross-app-return`
 * result. The mint enforces the account's required-MFA policy on the server,
 * which can be stricter than the browser's assurance check (a stale proof, an
 * unbound factor or a missing aal2 step after a provider sign-in). A
 * `MFA_REQUIRED` answer opens the MFA step-up once instead of stranding the
 * user on Tuturuuu; a second refusal after step-up is a handoff failure with
 * a retry.
 */
export function classifyCrossAppHandoff(
  handoff: CrossAppHandoffResponse,
  { stepUpAttempted }: { stepUpAttempted: boolean }
): CrossAppHandoffOutcome {
  if (handoff?.returnUrl && handoff.targetApp) {
    return { kind: 'redirect', returnUrl: handoff.returnUrl };
  }

  if (handoff?.code === 'MFA_REQUIRED' && !stepUpAttempted) {
    return { kind: 'mfa_step_up' };
  }

  return {
    kind: 'failure',
    failure: handoff?.error === 'Invalid returnUrl' ? 'invalid' : 'handoff',
  };
}

/**
 * Identifies an explicit Continue on the account confirmation: the signed-in
 * account and the exact returnUrl it confirmed. Null when either is unknown,
 * so nothing can match it.
 */
export function getConfirmedReturnKey(
  userId: string | null | undefined,
  returnUrl: string | null | undefined
) {
  return userId && returnUrl ? JSON.stringify([userId, returnUrl]) : null;
}

/**
 * The account an explicit Continue confirmed, only for that exact return;
 * the mint sends it so the server refuses any other session.
 */
export function getConfirmedUserId(
  confirmedReturnKey: string | null,
  returnUrl: string
) {
  if (!confirmedReturnKey) return undefined;
  try {
    const [userId, confirmedReturnUrl] = JSON.parse(confirmedReturnKey) as [
      string,
      string,
    ];
    return confirmedReturnUrl === returnUrl ? userId : undefined;
  } catch {
    return undefined;
  }
}

/** The mint request: the app's PKCE challenge and the confirmed account. */
export function buildHandoffRequest(
  searchParams: Pick<URLSearchParams, 'get'>,
  returnUrl: string,
  confirmedReturnKey: string | null
) {
  return {
    ...getCrossAppPkceParams(searchParams),
    expectedUserId: getConfirmedUserId(confirmedReturnKey, returnUrl),
    returnUrl,
  };
}

export const CROSS_APP_HANDOFF_TIMEOUT_MS = 15_000;

/**
 * Rejects when a handoff step does not settle in time, so a stalled mint or
 * session refresh reaches the retry card instead of an endless spinner.
 */
export function withHandoffTimeout<T>(
  promise: Promise<T>,
  timeoutMs = CROSS_APP_HANDOFF_TIMEOUT_MS
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = globalThis.setTimeout(
      () => reject(new Error('Cross-app handoff timed out')),
      timeoutMs
    );
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) globalThis.clearTimeout(timeoutId);
  });
}
