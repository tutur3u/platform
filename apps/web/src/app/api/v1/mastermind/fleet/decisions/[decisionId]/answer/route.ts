import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  isFleetOwner,
  MASTERMIND_APP_SESSION,
} from '@/lib/mastermind/fleet/auth';
import {
  type FleetAnswerRecord,
  fleetAnswerInputSchema,
} from '@/lib/mastermind/fleet/contract';
import { isLoginActionable } from '@/lib/mastermind/fleet/login';
import {
  FLEET_NO_STORE,
  fleetError,
  fleetStore,
  readCappedText,
} from '@/lib/mastermind/fleet/http';
import {
  FleetAnswerConflictError,
  readFleetState,
  recordFleetAnswer,
  replayFleetAnswer,
} from '@/lib/mastermind/fleet/store';

const IDEMPOTENCY_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DECISION_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function receipt(answer: FleetAnswerRecord) {
  return NextResponse.json(
    {
      action: answer.action,
      ...(answer.optionId ? { optionId: answer.optionId } : {}),
      revision: answer.revision,
      answeredAt: answer.answeredAt,
      pickedUp: answer.pickedUpRevision >= answer.revision,
    },
    { status: 202, headers: FLEET_NO_STORE }
  );
}

/**
 * Owner answer to an open fleet decision. It is stored as a durable record the
 * orchestrator pulls; nothing here messages a fleet thread. A retry of an
 * answer this actor already recorded (same key and payload) gets its original
 * receipt even after the decision closed, so a lost response never reads as
 * closed; anything else on a closed decision is a 409. On an open decision
 * the same key from another actor or with another payload is a 409
 * `idempotency_conflict`, never another actor's receipt.
 */
export const POST = withSessionAuth<{ decisionId: string }>(
  async (request, { user }, { decisionId }) => {
    if (!DECISION_ID.test(decisionId)) return fleetError('not_found', 404);
    if (!(await isFleetOwner(user))) return fleetError('forbidden', 403);

    const body = await readCappedText(request, 8 * 1024);
    if (body === null) return fleetError('payload_too_large', 413);
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return fleetError('invalid_json', 400);
    }
    const parsed = fleetAnswerInputSchema.safeParse(json);
    if (!parsed.success) return fleetError('invalid_answer', 422);
    const idempotencyKey = (
      request.headers.get('idempotency-key') ??
      parsed.data.idempotencyKey ??
      ''
    ).trim();
    if (!IDEMPOTENCY_KEY.test(idempotencyKey))
      return fleetError('idempotency_key_required', 400);

    const store = await fleetStore();
    if (!store) return fleetError('unavailable', 503);
    try {
      const stored = await readFleetState(store);
      const decision = stored?.state.decisions.find((d) => d.id === decisionId);
      const closed = async (error: 'decision_closed' | 'login_closed') => {
        const replay = await replayFleetAnswer(
          store,
          decisionId,
          parsed.data,
          idempotencyKey,
          user.id
        );
        return replay ? receipt(replay) : fleetError(error, 409);
      };
      if (!decision) return closed('decision_closed');
      // "I signed in" exists only on login requests that are still open, and
      // an ask's approve or hold never answers a login request. "Request
      // changes" exists only on design reviews.
      if (
        (parsed.data.action === 'signed_in') !== (decision.kind === 'login') &&
        parsed.data.action !== 'reply'
      )
        return fleetError('invalid_answer', 422);
      if (
        parsed.data.action === 'request_changes' &&
        decision.kind !== 'review'
      )
        return fleetError('invalid_answer', 422);
      if (
        parsed.data.action === 'signed_in' &&
        (!decision.login || !isLoginActionable(decision.login))
      )
        return closed('login_closed');
      if (
        parsed.data.optionId &&
        !decision.options.some((option) => option.id === parsed.data.optionId)
      )
        return fleetError('unknown_option', 422);

      return receipt(
        await recordFleetAnswer(
          store,
          decisionId,
          parsed.data,
          idempotencyKey,
          new Date(),
          user.id
        )
      );
    } catch (error) {
      if (error instanceof FleetAnswerConflictError)
        return fleetError('idempotency_conflict', 409);
      return fleetError('unavailable', 503);
    }
  },
  {
    rateLimit: { windowMs: 60_000, maxRequests: 30 },
    maxPayloadSize: 8192,
    allowAppSessionAuth: MASTERMIND_APP_SESSION,
    // The Mastermind phone app cannot solve the browser Turnstile step-up;
    // the fleet owner (allowlist plus root permission) is exempt from it.
    stepUpExempt: (user) => isFleetOwner(user),
  }
);
