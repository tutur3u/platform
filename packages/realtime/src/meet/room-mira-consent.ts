import { z } from 'zod';
import { MEET_ASSISTANT_USER_ID } from './assistant-mentions';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { RoomChatMessage, RoomServiceState } from './room-service';

/**
 * All-participant fence for room Mira (room chat @mira). Room Mira may read
 * room content only while every admitted account, guests included, has chosen
 * Continue on the current room notice. A missing, older-version or Mute choice
 * from anyone present pauses room Mira for everyone.
 */
export const MIRA_ROOM_NOTICE_VERSION = '2026-11-20-room-v1';
export const MIRA_ROOM_CONSENT_REQUIRED =
  'Room Mira answers after everyone in the meeting chooses Continue.';

export type MiraRoomChoice = {
  choice: 'continue' | 'mute';
  version: string;
  meetingId: string;
  accountId: string;
  recordedAt: number;
  revision: number;
};
/**
 * A Pause requested while already-admitted provider requests carry the
 * account's words. It blocks every new room-derived send at once and becomes
 * the effective choice when those bounded leases release or expire.
 */
export type MiraRoomPendingPause = { requestedAt: number; meetingId: string };
export type MiraRoomState = {
  choices: Record<string, MiraRoomChoice>;
  pending?: Record<string, MiraRoomPendingPause>;
};

export type MiraRoomFence = {
  ready: boolean;
  /** Admitted accounts without a current Continue, never their identities. */
  pending: number;
  admitted: number;
};

const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mira.room.read') }),
  z.object({
    action: z.literal('mira.room.choice'),
    choice: z.enum(['continue', 'mute']),
    version: z.literal(MIRA_ROOM_NOTICE_VERSION),
  }),
  // Brackets every provider request that carries room-derived content.
  z.object({
    action: z.literal('mira.room.dispatch'),
    messageId: z.string().max(200),
    leaseId: z.uuid(),
  }),
  z.object({
    action: z.literal('mira.room.release'),
    messageId: z.string().max(200),
    leaseId: z.uuid(),
  }),
]);

/** Active provider requests per room Mira request, and their lifetime. */
const MAX_DISPATCHES = 8;
const DISPATCH_TTL_MS = 120_000;

const accountOf = (person: { accountId?: string; userId: string }) =>
  person.accountId ?? person.userId;

export function admittedMiraRoomAccounts(state: RoomServiceState) {
  return [...new Set(Object.values(state.presence).map(accountOf))];
}

export function isCurrentMiraRoomContinue(
  state: RoomServiceState,
  meetingId: string | undefined,
  accountId: string
) {
  const choice = state.miraRoom?.choices[accountId];
  return !!(
    meetingId &&
    // A requested Pause stops every new send before it is effective.
    !state.miraRoom?.pending?.[accountId] &&
    choice &&
    choice.choice === 'continue' &&
    choice.accountId === accountId &&
    choice.meetingId === meetingId &&
    choice.version === MIRA_ROOM_NOTICE_VERSION &&
    Number.isSafeInteger(choice.revision) &&
    choice.revision > 0
  );
}

export function miraRoomFence(
  state: RoomServiceState,
  meetingId: string | undefined
): MiraRoomFence {
  const accounts = admittedMiraRoomAccounts(state);
  const pending = accounts.filter(
    (accountId) => !isCurrentMiraRoomContinue(state, meetingId, accountId)
  ).length;
  return {
    ready: !state.ended && accounts.length > 0 && pending === 0,
    pending,
    admitted: accounts.length,
  };
}

/**
 * Room chat sent to the provider: only messages written by accounts with a
 * current Continue. Mira's own earlier replies are omitted because they can
 * quote people who have since withdrawn; messages from people who left
 * without choosing Continue never leave the room.
 */
export function consentedMiraRoomChat(
  state: RoomServiceState,
  meetingId: string | undefined,
  chat: readonly RoomChatMessage[]
) {
  return chat.filter(
    (message) =>
      message.assistant !== true &&
      message.userId !== MEET_ASSISTANT_USER_ID &&
      isCurrentMiraRoomContinue(
        state,
        meetingId,
        message.accountId ?? message.userId
      )
  );
}

export function applyMiraRoomConsent(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  now = Date.now()
): { state: RoomServiceState; body: unknown; status?: number } | null {
  const parsed = command.safeParse(input);
  if (!parsed.success) return null;
  if (!token.scopes.includes('meet:server'))
    return { state, body: { error: 'Forbidden' }, status: 403 };
  const accountId = token.accountId ?? token.userId;
  // A release always ends its lease, even after the requester left, so a
  // pending Pause never waits longer than the request itself.
  if (parsed.data.action === 'mira.room.release')
    return miraRoomDispatch(state, token, accountId, parsed.data, now);
  const settled = settleMiraRoomWithdrawals(state, now);
  const admitted = admittedMiraRoomAccounts(settled).includes(accountId);
  if (!admitted || settled.ended)
    return {
      state: settled,
      body: { error: 'Join an active meeting first' },
      status: 403,
    };
  const own = settled.miraRoom?.choices[accountId];
  const pending = settled.miraRoom?.pending?.[accountId];
  const view = (next: RoomServiceState) => ({
    version: MIRA_ROOM_NOTICE_VERSION,
    choice:
      next.miraRoom?.choices[accountId]?.version === MIRA_ROOM_NOTICE_VERSION
        ? next.miraRoom.choices[accountId]!.choice
        : null,
    pausing: !!next.miraRoom?.pending?.[accountId],
    fence: miraRoomFence(next, token.meetingId),
  });
  const reply = (next: RoomServiceState) => ({ state: next, body: view(next) });
  if (parsed.data.action === 'mira.room.read') return reply(settled);
  if (parsed.data.action === 'mira.room.dispatch')
    return miraRoomDispatch(settled, token, accountId, parsed.data, now);
  const choice = parsed.data.choice;
  if (choice === 'mute') {
    if (pending) return reply(settled);
    // Already-admitted sends carrying this account finish under their lease;
    // nothing new starts, and the Pause takes effect when they settle.
    if (
      own?.choice === 'continue' &&
      activeMiraRoomLeases(settled, accountId, now) > 0
    )
      return reply({
        ...settled,
        miraRoom: {
          choices: settled.miraRoom?.choices ?? {},
          pending: {
            ...settled.miraRoom?.pending,
            [accountId]: { requestedAt: now, meetingId: token.meetingId ?? '' },
          },
        },
      });
  }
  // Continue while pausing cancels the Pause with a new revision, so requests
  // reserved before it stay stale.
  if (
    !pending &&
    own?.choice === choice &&
    own.version === MIRA_ROOM_NOTICE_VERSION &&
    own.meetingId === token.meetingId
  )
    return reply(settled);
  return reply(
    recordMiraRoomChoice(settled, accountId, token.meetingId ?? '', choice, now)
  );
}

function recordMiraRoomChoice(
  state: RoomServiceState,
  accountId: string,
  meetingId: string,
  choice: MiraRoomChoice['choice'],
  now: number
): RoomServiceState {
  const own = state.miraRoom?.choices[accountId];
  const { [accountId]: _cleared, ...pending } = state.miraRoom?.pending ?? {};
  return {
    ...state,
    miraRoom: {
      choices: {
        ...state.miraRoom?.choices,
        [accountId]: {
          choice,
          version: MIRA_ROOM_NOTICE_VERSION,
          meetingId,
          accountId,
          recordedAt: now,
          revision: own?.meetingId === meetingId ? own.revision + 1 : 1,
        },
      },
      pending,
    },
  };
}

/** Unexpired dispatch leases on requests that carry this account's words. */
export function activeMiraRoomLeases(
  state: RoomServiceState,
  accountId: string,
  now: number
) {
  return Object.values(state.aiRequests ?? {})
    .filter((request) => request.miraRoomSources?.[accountId] !== undefined)
    .flatMap((request) => Object.values(request.miraDispatches ?? {}))
    .filter((admittedAt) => now - admittedAt < DISPATCH_TTL_MS).length;
}

/** Makes each pending Pause effective once its account has no active lease. */
export function settleMiraRoomWithdrawals(
  state: RoomServiceState,
  now: number
): RoomServiceState {
  let next = state;
  for (const [accountId, pause] of Object.entries(
    state.miraRoom?.pending ?? {}
  ))
    if (activeMiraRoomLeases(next, accountId, now) === 0)
      next = recordMiraRoomChoice(
        next,
        accountId,
        pause.meetingId,
        'mute',
        now
      );
  return next;
}

/** Accounts whose words a request carries, bound to their consent revision. */
export type MiraRoomSources = Record<string, number>;

const consentRequired = (state: RoomServiceState) => ({
  state,
  body: {
    error: MIRA_ROOM_CONSENT_REQUIRED,
    code: 'MIRA_ROOM_CONSENT_REQUIRED',
  },
  status: 409,
});

/**
 * True while every source account still holds the exact Continue revision
 * the request was reserved with. A Pause, a later Continue (new revision),
 * leaving after a Pause or a request reserved without sources all fail, so
 * saved context is never sent or published once its authors changed choice.
 */
export function miraRoomSourcesCurrent(
  state: RoomServiceState,
  meetingId: string | undefined,
  sources: MiraRoomSources | undefined
) {
  if (!sources) return false;
  const entries = Object.entries(sources);
  return (
    entries.length > 0 &&
    entries.every(
      ([accountId, revision]) =>
        isCurrentMiraRoomContinue(state, meetingId, accountId) &&
        state.miraRoom?.choices[accountId]?.revision === revision
    )
  );
}

function miraRoomSources(
  state: RoomServiceState,
  meetingId: string | undefined,
  requesterId: string,
  chat: readonly RoomChatMessage[]
): MiraRoomSources {
  const accounts = new Set([requesterId]);
  for (const message of chat)
    if (message.assistant !== true)
      accounts.add(message.accountId ?? message.userId);
  return Object.fromEntries(
    [...accounts].map((accountId) => [
      accountId,
      state.miraRoom?.choices[accountId]?.revision ?? 0,
    ])
  );
}

/** The fence plus unchanged sources for one reserved room Mira request. */
export function miraRoomRequestReady(
  state: RoomServiceState,
  meetingId: string | undefined,
  messageId: string
) {
  return (
    miraRoomFence(state, meetingId).ready &&
    miraRoomSourcesCurrent(
      state,
      meetingId,
      state.aiRequests?.[messageId]?.miraRoomSources
    )
  );
}

/**
 * Dispatch admission for one provider request, serialized in the room with
 * every consent change. `mira.room.dispatch` admits only while the fence and
 * every source are current and records a lease; `mira.room.release` ends the
 * lease and reports whether consent stayed unchanged for its whole duration.
 * A choice recorded during the lease is ordered after the admission, so the
 * caller discards that response and every later request is refused.
 */
function miraRoomDispatch(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  accountId: string,
  input: { action: string; messageId: string; leaseId: string },
  now: number
): { state: RoomServiceState; body: unknown; status?: number } {
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
        // Ending the last lease makes any pending Pause effective.
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
 * - `ai.reserve` needs every admitted account's current Continue; the
 *   released chat is limited to consenting authors and the request records
 *   each source account with its exact consent revision.
 * - `ai.review.claim` (resend to the provider), `ai.review.save`,
 *   `ai.review.share` and an `ai.finish` that posts a reply additionally need
 *   every recorded source unchanged.
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
  if (
    action === 'ai.reserve'
      ? !miraRoomFence(state, token.meetingId).ready
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
  return {
    ...result,
    state: {
      ...result.state,
      aiRequests: {
        ...result.state.aiRequests,
        [messageId]: {
          ...request,
          miraRoomSources: miraRoomSources(
            state,
            token.meetingId,
            token.accountId ?? token.userId,
            chat
          ),
        },
      },
    },
    body: { ...result.body, chat },
  };
}
