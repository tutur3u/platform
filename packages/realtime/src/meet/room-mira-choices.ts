import { MEET_ASSISTANT_USER_ID } from './assistant-mentions';
import {
  currentMiraRoomAcceptance,
  MIRA_ROOM_NOTICE_VERSION,
  type MiraRoomAcceptance,
} from './room-mira-acceptance';
import type { RoomChatMessage, RoomServiceState } from './room-service';

/**
 * Per-author consent for room Mira (room chat @mira). A host acceptance turns
 * Mira on for the meeting; each participant's own choice decides whether
 * Mira reads their content. A choice counts only while its acceptance
 * revision and notice version equal the current ones, so a participant with
 * no current choice is off. Room content sent to the provider is limited to
 * authors who are on; one person turning Mira off never stops it for others.
 */
export const MIRA_ROOM_CONSENT_REQUIRED =
  'Room Mira answers after the host turns it on and you choose to use it.';

export type MiraRoomChoice = {
  choice: 'on' | 'off';
  version: string;
  acceptanceRevision: number;
  meetingId: string;
  accountId: string;
  recordedAt: number;
  /** Per-account choice counter; request sources bind to it. */
  revision: number;
};
/**
 * Turning off while already-admitted provider requests carry the account's
 * words. It blocks every new send carrying them at once, and becomes the
 * effective choice when those bounded leases release or expire.
 */
export type MiraRoomPendingPause = {
  requestedAt: number;
  meetingId: string;
  acceptanceRevision: number;
};
export type MiraRoomState = {
  acceptance?: MiraRoomAcceptance | null;
  /** Highest acceptance revision seen; older revisions are refused. */
  lastRevision?: number;
  choices: Record<string, MiraRoomChoice>;
  pending?: Record<string, MiraRoomPendingPause>;
};

export type MiraRoomStatus = {
  /** A host acceptance is current. */
  active: boolean;
  /** Admitted accounts whose current choice is on, never their identities. */
  included: number;
  admitted: number;
};

/** Lifetime of one admitted room Mira provider request. */
export const DISPATCH_TTL_MS = 120_000;

const accountOf = (person: { accountId?: string; userId: string }) =>
  person.accountId ?? person.userId;

export function admittedMiraRoomAccounts(state: RoomServiceState) {
  return [...new Set(Object.values(state.presence).map(accountOf))];
}

export function isCurrentMiraRoomOn(
  state: RoomServiceState,
  meetingId: string | undefined,
  accountId: string
) {
  const acceptance = currentMiraRoomAcceptance(state);
  const choice = state.miraRoom?.choices[accountId];
  return !!(
    meetingId &&
    acceptance &&
    // A requested opt-out stops every new send before it is effective.
    !state.miraRoom?.pending?.[accountId] &&
    choice &&
    choice.choice === 'on' &&
    choice.accountId === accountId &&
    choice.meetingId === meetingId &&
    choice.version === MIRA_ROOM_NOTICE_VERSION &&
    choice.acceptanceRevision === acceptance.revision &&
    Number.isSafeInteger(choice.revision) &&
    choice.revision > 0
  );
}

export function miraRoomStatus(
  state: RoomServiceState,
  meetingId: string | undefined
): MiraRoomStatus {
  const accounts = admittedMiraRoomAccounts(state);
  return {
    active: !!currentMiraRoomAcceptance(state),
    included: accounts.filter((id) => isCurrentMiraRoomOn(state, meetingId, id))
      .length,
    admitted: accounts.length,
  };
}

/** Whether this account may send a new room Mira request now. */
export function miraRoomRequesterReady(
  state: RoomServiceState,
  meetingId: string | undefined,
  accountId: string
) {
  return (
    !!currentMiraRoomAcceptance(state)?.capabilities.includes('chat') &&
    isCurrentMiraRoomOn(state, meetingId, accountId)
  );
}

/**
 * Room chat sent to the provider: only messages written by accounts whose
 * current choice is on. Mira's own replies and system lines are omitted
 * because they can quote people who are off.
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
      isCurrentMiraRoomOn(state, meetingId, message.accountId ?? message.userId)
  );
}

export function recordMiraRoomChoice(
  state: RoomServiceState,
  accountId: string,
  meetingId: string,
  choice: MiraRoomChoice['choice'],
  acceptanceRevision: number,
  now: number
): RoomServiceState {
  const own = state.miraRoom?.choices[accountId];
  const { [accountId]: _cleared, ...pending } = state.miraRoom?.pending ?? {};
  return {
    ...state,
    miraRoom: {
      ...state.miraRoom,
      choices: {
        ...state.miraRoom?.choices,
        [accountId]: {
          choice,
          version: MIRA_ROOM_NOTICE_VERSION,
          acceptanceRevision,
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

/** Makes each pending opt-out effective once its account has no active lease. */
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
        'off',
        pause.acceptanceRevision,
        now
      );
  return next;
}

/** Accounts whose words a request carries, bound to their choice revision. */
export type MiraRoomSources = Record<string, number>;

export const consentRequired = (state: RoomServiceState) => ({
  state,
  body: {
    error: MIRA_ROOM_CONSENT_REQUIRED,
    code: 'MIRA_ROOM_CONSENT_REQUIRED',
  },
  status: 409,
});

/**
 * True while every source account still holds the exact on revision the
 * request was reserved with. An opt-out, a later choice, an ended or
 * replaced acceptance, or a request reserved without sources all fail, so
 * saved context is never sent or published once any author changed.
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
        isCurrentMiraRoomOn(state, meetingId, accountId) &&
        state.miraRoom?.choices[accountId]?.revision === revision
    )
  );
}

export function miraRoomSources(
  state: RoomServiceState,
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

/** Same acceptance, requester still on and unchanged sources. */
export function miraRoomRequestReady(
  state: RoomServiceState,
  meetingId: string | undefined,
  messageId: string
) {
  const request = state.aiRequests?.[messageId];
  const acceptance = currentMiraRoomAcceptance(state);
  return (
    !!request &&
    !!acceptance?.capabilities.includes('chat') &&
    request.miraRoomAcceptance === acceptance.revision &&
    isCurrentMiraRoomOn(state, meetingId, request.userId) &&
    miraRoomSourcesCurrent(state, meetingId, request.miraRoomSources)
  );
}
