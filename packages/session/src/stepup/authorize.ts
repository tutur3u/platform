/**
 * Authorization of a verified step-up proof: the relying service's challenge
 * is consumed first, then the session's liveness is read. A charged or
 * effectful step runs only after `authorized`, in a later transaction.
 */
import type { UserId } from '../principal';
import type { StepUpAct } from './params-hash';
import { type StepUpVerified, takeIssuedStepUp } from './verify-proof';

export type StepUpConsumeInput = Readonly<{
  subject: UserId;
  nonce: string;
  jti: string;
  challengeId: string;
  exp: number;
}>;

export type StepUpConsumeResult =
  | 'consumed'
  | 'unknown_nonce'
  | 'replayed'
  | 'unavailable';

/**
 * The relying service's single-use challenge store, scoped to its audience.
 * `consume` is one storage transaction: it returns `consumed` only for a
 * nonce the service issued for `challengeId` and `subject` before minting,
 * whose nonce and `jti` are both unused, and keeps both spent until `exp`.
 * It stores only `jti`, `nonce` and `challengeId`.
 */
export interface StepUpConsumePort {
  consume(input: StepUpConsumeInput): Promise<StepUpConsumeResult>;
}

export type SessionLivenessInput = Readonly<{
  subject: UserId;
  sessionId: string;
  generation: number;
}>;

export type SessionLivenessResult =
  | 'live'
  | 'revoked'
  | 'superseded'
  | 'unavailable';

/**
 * An uncached, authoritative read of whether `sessionId` is live at
 * `generation`, with a fresh epoch read. Never a cached liveness view.
 */
export interface SessionLivenessPort {
  check(input: SessionLivenessInput): Promise<SessionLivenessResult>;
}

export type AuthorizeStepUpOptions = {
  /** The stored challenge this proof's nonce was issued for. */
  challengeId: string;
  /** Current time in seconds. */
  now: () => number;
  consume: StepUpConsumePort;
  liveness: SessionLivenessPort;
};

export type StepUpAuthorizeFailureReason =
  | 'not_verified'
  | 'options'
  | 'expired'
  | 'unknown_nonce'
  | 'replayed'
  | 'consume_unavailable'
  | 'revoked'
  | 'superseded'
  | 'liveness_unavailable';

export type StepUpAuthorization = Readonly<{
  subject: UserId;
  sessionId: string;
  generation: number;
  act: StepUpAct;
  challengeId: string;
  jti: string;
}>;

export type StepUpAuthorizeResult =
  | Readonly<{
      ok: true;
      status: 'authorized';
      authorization: StepUpAuthorization;
    }>
  | Readonly<{ ok: false; reason: StepUpAuthorizeFailureReason }>;

const fail = (reason: StepUpAuthorizeFailureReason): StepUpAuthorizeResult =>
  Object.freeze({ ok: false, reason });

const MAX_CHALLENGE_ID_LENGTH = 256;

function validOptions(options: AuthorizeStepUpOptions): boolean {
  if (typeof options !== 'object' || options === null) return false;
  const { challengeId, now, consume, liveness } = options;
  return (
    typeof challengeId === 'string' &&
    challengeId.length > 0 &&
    challengeId.length <= MAX_CHALLENGE_ID_LENGTH &&
    typeof now === 'function' &&
    typeof consume?.consume === 'function' &&
    typeof liveness?.check === 'function'
  );
}

/**
 * Authorizes a verified step-up proof. It consumes the challenge first, and
 * only `consumed` proceeds; it then reads liveness, and only `live` returns
 * `authorized`. Every other outcome, a throwing port, an unexpected port
 * result and an expired proof fail closed with distinct reasons, and a
 * consumed nonce stays spent. Each verified object is accepted once.
 */
export async function authorizeStepUp(
  verified: StepUpVerified,
  options: AuthorizeStepUpOptions
): Promise<StepUpAuthorizeResult> {
  if (!validOptions(options)) return fail('options');
  if (!takeIssuedStepUp(verified)) return fail('not_verified');
  const { challengeId, consume, liveness } = options;

  let now: number;
  try {
    now = Math.floor(options.now());
  } catch {
    return fail('options');
  }
  if (!Number.isFinite(now)) return fail('options');
  if (now >= verified.expiresAt) return fail('expired');

  let consumed: unknown;
  try {
    consumed = await consume.consume(
      Object.freeze({
        subject: verified.subject,
        nonce: verified.nonce,
        jti: verified.jti,
        challengeId,
        exp: verified.expiresAt,
      })
    );
  } catch {
    return fail('consume_unavailable');
  }
  if (consumed === 'unknown_nonce') return fail('unknown_nonce');
  if (consumed === 'replayed') return fail('replayed');
  if (consumed !== 'consumed') return fail('consume_unavailable');

  let live: unknown;
  try {
    live = await liveness.check(
      Object.freeze({
        subject: verified.subject,
        sessionId: verified.sessionId,
        generation: verified.generation,
      })
    );
  } catch {
    return fail('liveness_unavailable');
  }
  if (live === 'revoked') return fail('revoked');
  if (live === 'superseded') return fail('superseded');
  if (live !== 'live') return fail('liveness_unavailable');

  return Object.freeze({
    ok: true,
    status: 'authorized',
    authorization: Object.freeze({
      subject: verified.subject,
      sessionId: verified.sessionId,
      generation: verified.generation,
      act: verified.act,
      challengeId,
      jti: verified.jti,
    }),
  });
}
