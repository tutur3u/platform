import { z } from 'zod';
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
 * current Continue, plus Mira's own replies. Messages from people who left
 * without choosing Continue never leave the room.
 */
export function consentedMiraRoomChat(
  state: RoomServiceState,
  meetingId: string | undefined,
  chat: readonly RoomChatMessage[]
) {
  return chat.filter(
    (message) =>
      message.assistant === true ||
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

const fenced = new Set(['ai.reserve', 'ai.review.claim']);

/**
 * Room chat generation fence. `ai.reserve` and `ai.review.claim` proceed only
 * while every admitted account has a current Continue, checked atomically with
 * the room state the reservation reads; the reserved chat is then limited to
 * consenting authors. Other actions pass through unchanged.
 */
export function fenceMiraRoomRequest<
  R extends { state: RoomServiceState; body: unknown; status?: number },
>(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  next: () => R
): R | { state: RoomServiceState; body: unknown; status: number } {
  const action =
    input && typeof input === 'object' && 'action' in input
      ? String(input.action)
      : '';
  if (!fenced.has(action)) return next();
  if (!miraRoomFence(state, token.meetingId).ready)
    return {
      state,
      body: {
        error: MIRA_ROOM_CONSENT_REQUIRED,
        code: 'MIRA_ROOM_CONSENT_REQUIRED',
      },
      status: 409,
    };
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
  return {
    ...result,
    body: {
      ...result.body,
      chat: consentedMiraRoomChat(
        state,
        token.meetingId,
        result.body.chat as RoomChatMessage[]
      ),
    },
  };
}
