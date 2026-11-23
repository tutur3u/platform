import {
  type AbuseRiskDecision,
  applyRateLimitDecision,
  recordAbuseActivitySignal,
  resolveAbuseRiskDecision,
} from '@tuturuuu/utils/abuse-protection/reputation';
import { MEET_GUEST_UNVERIFIED_NETWORK_LIMIT } from '../lib/guest-unverified-limit';

export const MEET_GUEST_UNVERIFIED_ROUTE = '/api/meet-call/guest/unverified';

export type MeetGuestUnverifiedRisk =
  | { allowed: true; networkLimit: number; decision: AbuseRiskDecision | null }
  | { allowed: false; decision: AbuseRiskDecision };

type RiskSources = {
  resolve?: typeof resolveAbuseRiskDecision;
  record?: typeof recordAbuseActivitySignal;
};

/**
 * Scores a join request that arrives without a Turnstile token with the
 * shared adaptive abuse policy. Restricted or challenge-required subjects are
 * refused outright; the rest get a per-network budget scaled by their trust
 * multiplier, never above the base unverified limit. Every request is
 * recorded so repeated unverified joins feed the subject's reputation.
 *
 * When the reputation store is unreachable the request keeps the base
 * budget: the rate limits and the host's lobby approval still apply.
 */
export async function assessMeetGuestUnverifiedJoin(
  request: Request,
  input: { meetingId: string; network: string | undefined },
  sources: RiskSources = {}
): Promise<MeetGuestUnverifiedRisk> {
  const resolve = sources.resolve ?? resolveAbuseRiskDecision;
  const record = sources.record ?? recordAbuseActivitySignal;
  let decision: AbuseRiskDecision | null = null;
  try {
    decision = await resolve({
      authKind: 'temp',
      headers: request.headers,
      ipAddress: input.network ?? null,
      isRead: false,
      method: 'POST',
      route: MEET_GUEST_UNVERIFIED_ROUTE,
    });
  } catch (error) {
    console.warn('Meet unverified guest risk check unavailable', {
      kind: error instanceof Error ? error.name : 'unknown',
    });
  }
  const refused =
    decision?.tier === 'restricted' || decision?.tier === 'challenge_required';
  if (decision?.subjects.length) {
    await record({
      ipAddress: input.network ?? null,
      method: 'POST',
      metadata: { meetingId: input.meetingId, refused },
      reasonCode: refused
        ? 'meet_guest_unverified_refused'
        : 'meet_guest_unverified_join',
      riskTier: decision.tier,
      route: MEET_GUEST_UNVERIFIED_ROUTE,
      // A refusal counts against the subject; an admitted lobby request
      // is only recorded, so a blocked check alone never builds a penalty.
      signalType: refused ? 'challenge_failed' : 'challenge_issued',
      subjects: decision.subjects,
    }).catch(() => undefined);
  }
  if (decision && refused) return { allowed: false, decision };
  return {
    allowed: true,
    decision,
    networkLimit: decision
      ? Math.min(
          MEET_GUEST_UNVERIFIED_NETWORK_LIMIT,
          applyRateLimitDecision(MEET_GUEST_UNVERIFIED_NETWORK_LIMIT, decision)
        )
      : MEET_GUEST_UNVERIFIED_NETWORK_LIMIT,
  };
}
