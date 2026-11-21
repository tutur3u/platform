/**
 * Per-isolate circuit breaker for the abuse-guard transport.
 *
 * A hung guard (calls time out instead of answering) would otherwise add one
 * full timeout to every guard call, and a guarded request makes several in
 * sequence. After `ABUSE_GUARD_BREAKER_FAILURE_THRESHOLD` consecutive timeout
 * or network failures the breaker opens: calls throw
 * `AbuseGuardUnavailableError('guard_unavailable')` without touching the
 * transport, so each family's existing fail-open or fail-closed policy applies
 * unchanged. After `ABUSE_GUARD_BREAKER_OPEN_MS` one trial call is let
 * through (half-open); success closes the breaker, a counted failure reopens it.
 *
 * Any answer from the guard, including a 4xx error such as `bad_request`,
 * `unauthorized`, `guard_limited` or `guard_stopped`, proves it is responsive:
 * it never counts and resets the consecutive-failure count. State is a few
 * numbers per backend target, held in memory only; no storage, no extra calls.
 */
import { type AbuseGuardTransport, AbuseGuardUnavailableError } from './client';

/** Consecutive timeout/network failures that open the breaker. */
export const ABUSE_GUARD_BREAKER_FAILURE_THRESHOLD = 3;
/** How long an open breaker fails fast before allowing one trial call. */
export const ABUSE_GUARD_BREAKER_OPEN_MS = 15_000;

export type GuardBreakerState = {
  /** Consecutive counted failures while closed. */
  failures: number;
  /** Epoch ms when the breaker opened; null while closed. */
  openedAt: number | null;
  /**
   * Epoch ms when the single half-open trial started; null when none is in
   * flight. A trial older than `ABUSE_GUARD_BREAKER_OPEN_MS` is abandoned:
   * a cancelled request (a Worker client disconnect) never settles it, so
   * it must not hold the circuit open forever.
   */
  trialStartedAt: number | null;
  /** Bumped per trial, so a superseded trial settling late changes nothing. */
  trialId: number;
};

export function createGuardBreakerState(): GuardBreakerState {
  return { failures: 0, openedAt: null, trialStartedAt: null, trialId: 0 };
}

function isCountedFailure(error: unknown) {
  return (
    error instanceof AbuseGuardUnavailableError &&
    (error.code === 'timeout' || error.code === 'network')
  );
}

/**
 * Wraps `transport` so it shares `state` with every other transport for the
 * same backend target. `target` is a short non-secret label for the log line.
 */
export function withGuardBreaker(
  transport: AbuseGuardTransport,
  state: GuardBreakerState,
  target: string,
  now: () => number = Date.now
): AbuseGuardTransport {
  const open = (reason: 'threshold' | 'trial_failed', failures: number) => {
    state.openedAt = now();
    state.failures = 0;
    console.warn('[abuse-guard] circuit opened', {
      target,
      reason,
      failures,
      openMs: ABUSE_GUARD_BREAKER_OPEN_MS,
    });
  };

  const close = () => {
    state.failures = 0;
    state.openedAt = null;
    state.trialStartedAt = null;
  };

  return async (rpc) => {
    let trial: number | null = null;
    if (state.openedAt !== null) {
      const at = now();
      const trialLive =
        state.trialStartedAt !== null &&
        at - state.trialStartedAt < ABUSE_GUARD_BREAKER_OPEN_MS;
      if (trialLive || at - state.openedAt < ABUSE_GUARD_BREAKER_OPEN_MS) {
        throw new AbuseGuardUnavailableError(
          'guard_unavailable',
          'Abuse guard store unavailable: circuit open'
        );
      }
      state.trialId += 1;
      state.trialStartedAt = at;
      trial = state.trialId;
    }
    const isCurrentTrial = () =>
      trial !== null &&
      state.trialStartedAt !== null &&
      state.trialId === trial;

    try {
      const payload = await transport(rpc);
      close();
      return payload;
    } catch (error) {
      if (!isCountedFailure(error)) {
        // The guard answered: it is responsive.
        close();
      } else if (trial !== null) {
        if (isCurrentTrial()) open('trial_failed', 1);
      } else if (state.openedAt === null) {
        state.failures += 1;
        if (state.failures >= ABUSE_GUARD_BREAKER_FAILURE_THRESHOLD) {
          open('threshold', state.failures);
        }
      }
      throw error;
    } finally {
      if (isCurrentTrial()) state.trialStartedAt = null;
    }
  };
}
