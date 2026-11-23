import type { MeetRealtimeTokenPayload } from './primitives';
import { currentMiraRoomAcceptance } from './room-mira-acceptance';
import {
  consentedMiraRoomChat,
  consentRequired,
  DISPATCH_TTL_MS,
  isCurrentMiraRoomOn,
  miraRoomRequesterReady,
  miraRoomRequestReady,
  miraRoomSources,
  settleMiraRoomWithdrawals,
} from './room-mira-choices';
import type { RoomChatMessage, RoomServiceState } from './room-service';

type Result = { state: RoomServiceState; body: unknown; status?: number };

/** Active provider requests per room Mira request. */
const MAX_DISPATCHES = 8;

const accountOf = (person: { accountId?: string; userId: string }) =>
  person.accountId ?? person.userId;

/**
 * Dispatch admission for one provider request, serialized in the room with
 * every consent change. `mira.room.dispatch` admits only while the request
 * is ready and records a lease; `mira.room.release` ends the lease and
 * reports whether consent stayed unchanged for its whole duration. A change
 * during the lease is ordered after the admission, so the caller discards
 * that response and every later request is refused.
 */
export function miraRoomDispatch(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  accountId: string,
  input: { action: string; messageId: string; leaseId: string },
  now: number
): Result {
  const request = state.aiRequests?.[input.messageId];
  const admitting = input.action === 'mira.room.dispatch';
  if (
    request?.userId !== accountId ||
    (admitting && request.status !== 'pending')
  )
    return consentRequired(state);
  const leases = Object.fromEntries(
    Object.entries(request.miraDispatches ?? {}).filter(
      ([id, admittedAt]) =>
        id !== input.leaseId && now - admittedAt < DISPATCH_TTL_MS
    )
  );
  const current = miraRoomRequestReady(state, token.meetingId, input.messageId);
  const held = request.miraDispatches?.[input.leaseId];
  if (admitting && (!current || Object.keys(leases).length >= MAX_DISPATCHES))
    return consentRequired(state);
  const next: RoomServiceState = {
    ...state,
    aiRequests: {
      ...state.aiRequests,
      [input.messageId]: {
        ...request,
        miraDispatches: admitting
          ? { ...leases, [input.leaseId]: now }
          : leases,
      },
    },
  };
  return admitting
    ? {
        state: next,
        // The caller bounds transport and observation to this lifetime.
        body: {
          ok: true,
          leaseId: input.leaseId,
          expiresInMs: DISPATCH_TTL_MS,
        },
      }
    : {
        // Ending the last lease makes any pending opt-out effective.
        state: settleMiraRoomWithdrawals(next, now),
        body: {
          current:
            current && held !== undefined && now - held < DISPATCH_TTL_MS,
        },
      };
}

/** Steps that send saved room content to the provider or publish from it. */
const sourceBound = new Set([
  'ai.review.claim',
  'ai.review.save',
  'ai.review.share',
]);

/**
 * Room chat generation fence, checked atomically with the room state:
 * - `ai.reserve` needs a current acceptance with chat and the requester's
 *   current on choice; the released chat and participant list are limited to
 *   authors who are on, and the request records the acceptance revision and
 *   each source account with its exact choice revision.
 * - `ai.review.claim` (resend to the provider), `ai.review.save`,
 *   `ai.review.share` and an `ai.finish` that posts a reply additionally need
 *   the same acceptance and every recorded source unchanged.
 * Cost-only `ai.finish`, discard and reads pass through so requests settle.
 */
export function fenceMiraRoomRequest<
  R extends { state: RoomServiceState; body: unknown; status?: number },
>(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  next: () => R
): R | { state: RoomServiceState; body: unknown; status: number } {
  const record =
    input && typeof input === 'object'
      ? (input as { action?: unknown; messageId?: unknown; body?: unknown })
      : {};
  const action = String(record.action ?? '');
  const messageId =
    typeof record.messageId === 'string' ? record.messageId : '';
  const publishes =
    sourceBound.has(action) || (action === 'ai.finish' && !!record.body);
  if (action !== 'ai.reserve' && !publishes) return next();
  const requesterId = token.accountId ?? token.userId;
  if (
    action === 'ai.reserve'
      ? !miraRoomRequesterReady(state, token.meetingId, requesterId)
      : !miraRoomRequestReady(state, token.meetingId, messageId)
  )
    return consentRequired(state);
  const result = next();
  if (
    action !== 'ai.reserve' ||
    (result.status ?? 200) >= 400 ||
    !result.body ||
    typeof result.body !== 'object' ||
    !('chat' in result.body) ||
    !Array.isArray(result.body.chat)
  )
    return result;
  const chat = consentedMiraRoomChat(
    state,
    token.meetingId,
    result.body.chat as RoomChatMessage[]
  );
  const request = result.state.aiRequests?.[messageId];
  if (!request) return consentRequired(state);
  const body = result.body as { meetingContext?: Record<string, unknown> };
  return {
    ...result,
    state: {
      ...result.state,
      aiRequests: {
        ...result.state.aiRequests,
        [messageId]: {
          ...request,
          miraRoomAcceptance: currentMiraRoomAcceptance(state)!.revision,
          miraRoomSources: miraRoomSources(state, requesterId, chat),
        },
      },
    },
    body: {
      ...result.body,
      chat,
      ...(body.meetingContext
        ? {
            meetingContext: {
              ...body.meetingContext,
              participants: includedParticipants(state, token.meetingId),
            },
          }
        : {}),
    },
  };
}

/**
 * A transcript Allow needs the account's current room Mira choice to be on:
 * a participant who is off or undecided is never captured. Returns a refusal
 * for such an Allow, or null to let the transcript handler run.
 */
export function guardMeetTranscriptAllow(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown
): Result | null {
  const record =
    input && typeof input === 'object'
      ? (input as { action?: unknown; choice?: unknown })
      : {};
  if (record.action !== 'transcript.consent.choice' || record.choice !== 'allow')
    return null;
  const accountId = token.accountId ?? token.userId;
  return isCurrentMiraRoomOn(
    settleMiraRoomWithdrawals(state, Date.now()),
    token.meetingId,
    accountId
  )
    ? null
    : consentRequired(state);
}

/** Names and roles of admitted participants who are on, never anyone else. */
function includedParticipants(
  state: RoomServiceState,
  meetingId: string | undefined
) {
  return [
    ...new Map(
      Object.values(state.presence)
        .filter((person) =>
          isCurrentMiraRoomOn(state, meetingId, accountOf(person))
        )
        .map((person) => [
          accountOf(person),
          { displayName: person.displayName, role: person.role },
        ])
    ).values(),
  ];
}
