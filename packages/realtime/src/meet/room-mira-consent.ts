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
export type MiraRoomState = { choices: Record<string, MiraRoomChoice> };

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
  // Checked immediately before the provider receives room content.
  z.object({ action: z.literal('mira.room.verify'), messageId: z.string() }),
]);

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
) {
  const parsed = command.safeParse(input);
  if (!parsed.success) return null;
  if (!token.scopes.includes('meet:server'))
    return { state, body: { error: 'Forbidden' }, status: 403 };
  const accountId = token.accountId ?? token.userId;
  const admitted = admittedMiraRoomAccounts(state).includes(accountId);
  if (!admitted || state.ended)
    return {
      state,
      body: { error: 'Join an active meeting first' },
      status: 403,
    };
  const current = state.miraRoom ?? { choices: {} };
  const own = current.choices[accountId];
  const view = (next: RoomServiceState) => ({
    version: MIRA_ROOM_NOTICE_VERSION,
    choice:
      next.miraRoom?.choices[accountId]?.version === MIRA_ROOM_NOTICE_VERSION
        ? next.miraRoom.choices[accountId]!.choice
        : null,
    fence: miraRoomFence(next, token.meetingId),
  });
  if (parsed.data.action === 'mira.room.read')
    return { state, body: view(state) };
  if (parsed.data.action === 'mira.room.verify') {
    const request = state.aiRequests?.[parsed.data.messageId];
    return request?.userId === accountId &&
      request.status === 'pending' &&
      miraRoomRequestReady(state, token.meetingId, parsed.data.messageId)
      ? { state, body: { ok: true } }
      : consentRequired(state);
  }
  if (
    own?.choice === parsed.data.choice &&
    own.version === MIRA_ROOM_NOTICE_VERSION &&
    own.meetingId === token.meetingId
  )
    return { state, body: view(state) };
  const next: RoomServiceState = {
    ...state,
    miraRoom: {
      choices: {
        ...current.choices,
        [accountId]: {
          choice: parsed.data.choice,
          version: MIRA_ROOM_NOTICE_VERSION,
          meetingId: token.meetingId ?? '',
          accountId,
          recordedAt: now,
          revision: own?.meetingId === token.meetingId ? own.revision + 1 : 1,
        },
      },
    },
  };
  return { state: next, body: view(next) };
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
