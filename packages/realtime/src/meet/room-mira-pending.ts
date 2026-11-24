import type { MeetRealtimeTokenPayload } from './primitives';
import { currentMiraRoomAcceptance } from './room-mira-acceptance';
import {
  admittedMiraRoomAccounts,
  type MiraRoomChoice,
  recordMiraRoomChoice,
} from './room-mira-choices';
import type { RoomServiceState } from './room-service';

/**
 * Two-phase room Mira on. A choice of on is staged as pending and has no
 * consent effect until the Meet Worker, after storing its durable evidence,
 * confirms it with the pending id. An unconfirmed entry expires and is
 * dropped, so the person keeps the previous state; nothing is fabricated.
 * Turning off applies at once and drops any pending on. Pending entries are
 * also dropped when the room loads from storage or is restored.
 */
export const MIRA_ON_PENDING_TTL_MS = 20_000;
export const MIRA_ROOM_PENDING_EXPIRED = 'MIRA_ROOM_PENDING_EXPIRED';

export type MiraRoomPendingOn = {
  /** Random and unguessable, bound to the room, account and notice mode. */
  pendingId: string;
  pendingUntil: number;
  roomId: string;
  meetingId: string;
  noticeMode: 'room' | 'self';
  /** The acceptance the participant chose under. */
  acceptanceRevision: number;
};

type Result = { state: RoomServiceState; body: unknown; status?: number };

export function pendingMiraOn(
  state: RoomServiceState,
  accountId: string,
  now: number
) {
  const pending = state.miraRoom?.pendingOn?.[accountId];
  return pending && now <= pending.pendingUntil ? pending : undefined;
}

/** Stages an on, replacing an older pending on of the same account. */
export function stageMiraOn(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  accountId: string,
  noticeMode: 'room' | 'self',
  acceptanceRevision: number,
  now: number
): { state: RoomServiceState; pending: MiraRoomPendingOn } {
  const pending: MiraRoomPendingOn = {
    pendingId: crypto.randomUUID(),
    pendingUntil: now + MIRA_ON_PENDING_TTL_MS,
    roomId: token.roomId,
    meetingId: token.meetingId ?? '',
    noticeMode,
    acceptanceRevision,
  };
  return {
    pending,
    state: {
      ...state,
      miraRoom: {
        ...state.miraRoom,
        choices: state.miraRoom?.choices ?? {},
        pendingOn: { ...state.miraRoom?.pendingOn, [accountId]: pending },
      },
    },
  };
}

/** Drops the account's pending on, which can then never be confirmed. */
export function dropMiraOn(
  state: RoomServiceState,
  accountId: string
): RoomServiceState {
  const pendingOn = state.miraRoom?.pendingOn;
  if (!pendingOn?.[accountId]) return state;
  const { [accountId]: _, ...rest } = pendingOn;
  return {
    ...state,
    miraRoom: { ...state.miraRoom!, pendingOn: rest },
  };
}

/** Drops every expired pending on (or all of them), keeping each choice. */
export function expireMiraOn<T extends RoomServiceState>(
  state: T,
  now: number,
  all = false
): T {
  const pendingOn = state.miraRoom?.pendingOn;
  if (!pendingOn) return state;
  const kept = Object.fromEntries(
    Object.entries(pendingOn).filter(
      ([, pending]) => !all && now <= pending.pendingUntil
    )
  );
  if (Object.keys(kept).length === Object.keys(pendingOn).length) return state;
  return { ...state, miraRoom: { ...state.miraRoom!, pendingOn: kept } };
}

/** The earliest moment a pending on expires, for the room's next wake. */
export function nextMiraOnExpiry(state: RoomServiceState) {
  const times = Object.values(state.miraRoom?.pendingOn ?? {}).map(
    (pending) => pending.pendingUntil
  );
  return times.length ? Math.min(...times) : undefined;
}

/**
 * The Meet Worker's confirm of a staged on, after its evidence is stored. It
 * succeeds only for the account's current pending on, in the same room and
 * under the room's current notice mode and acceptance, while the person is
 * still admitted. Anything else changes nothing and answers 409. A repeated
 * confirm of the id that made the current on answers 200.
 */
export function confirmMiraOn(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  accountId: string,
  input: { pendingId: string; noticeMode?: 'room' | 'self' },
  now: number,
  reply: (state: RoomServiceState) => Result
): Result {
  const own = state.miraRoom?.choices[accountId];
  if (own?.choice === 'on' && own.confirmedPendingId === input.pendingId)
    return reply(state);
  const pending = pendingMiraOn(state, accountId, now);
  const acceptance = currentMiraRoomAcceptance(state);
  if (
    !pending ||
    pending.pendingId !== input.pendingId ||
    pending.roomId !== token.roomId ||
    pending.meetingId !== (token.meetingId ?? '') ||
    (input.noticeMode && input.noticeMode !== pending.noticeMode) ||
    pending.noticeMode !== (state.selfCapture?.mode ?? 'room') ||
    !acceptance ||
    acceptance.revision !== pending.acceptanceRevision ||
    state.ended ||
    !admittedMiraRoomAccounts(state).includes(accountId)
  ) {
    console.warn('[meet-mira] stale pending confirm', {
      pendingId: input.pendingId,
    });
    return {
      state,
      body: {
        error: 'The Mira choice expired',
        code: MIRA_ROOM_PENDING_EXPIRED,
      },
      status: 409,
    };
  }
  const recorded = recordMiraRoomChoice(
    dropMiraOn(state, accountId),
    accountId,
    pending.meetingId,
    'on',
    pending.acceptanceRevision,
    now,
    pending.noticeMode
  );
  const choice = recorded.miraRoom!.choices[accountId]!;
  return reply({
    ...recorded,
    miraRoom: {
      ...recorded.miraRoom!,
      choices: {
        ...recorded.miraRoom!.choices,
        [accountId]: {
          ...choice,
          confirmedPendingId: pending.pendingId,
        } satisfies MiraRoomChoice,
      },
    },
  });
}
