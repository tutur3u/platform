import type { MeetAiGateEnv } from './ai-workspace-gate';
import type { MeetRealtimeTokenPayload } from './primitives';
import { applySelfCapture } from './room-self-capture';
import { settleSelfCapture, takeBucket } from './room-self-capture-state';
import type { RoomServiceState } from './room-service';

type Result = { state: RoomServiceState; body: unknown; status?: number };

/**
 * In per-speaker mode an Allow spends the account's open/choice bucket
 * (burst 3, one per 30 s). A Decline is never limited, so an opt-out always
 * takes effect.
 */
export function chargeSelfCaptureChoice(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  now: number
): Result | null {
  const record =
    input && typeof input === 'object'
      ? (input as { action?: unknown; choice?: unknown })
      : {};
  const capture = state.selfCapture;
  if (
    record.action !== 'transcript.consent.choice' ||
    record.choice !== 'allow' ||
    capture?.mode !== 'self' ||
    !token.scopes.includes('meet:server')
  )
    return null;
  const buckets = takeBucket(
    capture.buckets,
    token.accountId ?? token.userId,
    'open',
    now
  );
  if (!buckets)
    return {
      state,
      body: { error: 'Too many changes', code: 'MEET_SELF_RATE_LIMITED' },
      status: 429,
    };
  return {
    state: { ...state, selfCapture: { ...capture, buckets } },
    body: null,
  };
}

/**
 * Runs per-speaker commands, or the rest of the room service with the
 * per-speaker fence settled afterwards, so every room-side ending reaches the
 * legal outbox in the same turn.
 */
export function routeSelfCapture<R extends Result>(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  env: MeetAiGateEnv,
  next: (state: RoomServiceState) => R,
  now = Date.now()
): R | Result {
  const handled = applySelfCapture(state, token, input, env, now);
  if (handled) return handled;
  const charged = chargeSelfCaptureChoice(state, token, input, now);
  if (charged?.status) return charged;
  const result = next(charged?.state ?? state);
  const settled = settleSelfCapture(result.state, now);
  return settled === result.state ? result : { ...result, state: settled };
}
