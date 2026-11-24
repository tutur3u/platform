import { z } from 'zod';
import type { MeetAiGateEnv } from './ai-workspace-gate';
import type { MeetRealtimeTokenPayload } from './primitives';
import { applySelfCapture } from './room-self-capture';
import {
  type SelfAllowNotice,
  settleSelfCapture,
  takeBucket,
} from './room-self-capture-state';
import type { RoomServiceState } from './room-service';
import { MEET_TRANSCRIPT_NOTICE_VERSION } from './room-transcript-consent';

type Result = { state: RoomServiceState; body: unknown; status?: number };

const noticeSchema = z
  .object({
    noticeVersion: z.string().max(120).optional(),
    locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
    textHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

type Prepared = { state: RoomServiceState; notice?: SelfAllowNotice };

/**
 * A transcript choice in per-speaker mode. An Allow must carry the notice
 * evidence (current version, locale and the SHA-256 hex of the text shown)
 * and spends the account's open/choice bucket (burst 3, one per 30 s). A
 * Decline is never limited, so an opt-out always takes effect.
 */
export function prepareSelfCaptureChoice(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  now: number
): Prepared | Result | null {
  const record =
    input && typeof input === 'object'
      ? (input as {
          action?: unknown;
          choice?: unknown;
          version?: unknown;
          notice?: unknown;
        })
      : {};
  const capture = state.selfCapture;
  if (
    record.action !== 'transcript.consent.choice' ||
    record.choice !== 'allow' ||
    capture?.mode !== 'self' ||
    !token.scopes.includes('meet:server')
  )
    return null;
  const refuse = (status: number, code: string) => ({
    state,
    body: { error: code, code },
    status,
  });
  const parsed = noticeSchema.safeParse(record.notice);
  if (!parsed.success) return refuse(400, 'MEET_SELF_NOTICE_REQUIRED');
  const noticeVersion = parsed.data.noticeVersion ?? record.version;
  if (
    noticeVersion !== MEET_TRANSCRIPT_NOTICE_VERSION ||
    record.version !== MEET_TRANSCRIPT_NOTICE_VERSION
  )
    return refuse(409, 'MEET_SELF_NOTICE_STALE');
  const buckets = takeBucket(
    capture.buckets,
    token.accountId ?? token.userId,
    'open',
    now
  );
  if (!buckets) return refuse(429, 'MEET_SELF_RATE_LIMITED');
  return {
    state: { ...state, selfCapture: { ...capture, buckets } },
    notice: {
      noticeVersion,
      locale: parsed.data.locale,
      textHash: parsed.data.textHash,
    },
  };
}

/**
 * Runs per-speaker commands, or the rest of the room service with the
 * per-speaker fence settled afterwards, so every room-side ending reaches the
 * legal outbox in the same turn. An accepted Allow stores its notice
 * evidence; the fence drops it as soon as the Allow is no longer current.
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
  const prepared = prepareSelfCaptureChoice(state, token, input, now);
  if (prepared && 'status' in prepared && prepared.status) return prepared;
  const result = next(prepared?.state ?? state);
  const notice = prepared && 'notice' in prepared ? prepared.notice : undefined;
  const stored =
    notice && !result.status && result.state.selfCapture
      ? {
          ...result.state,
          selfCapture: {
            ...result.state.selfCapture,
            allowNotices: {
              ...result.state.selfCapture.allowNotices,
              [token.accountId ?? token.userId]: notice,
            },
          },
        }
      : result.state;
  const settled = settleSelfCapture(stored, now);
  return settled === result.state ? result : { ...result, state: settled };
}
