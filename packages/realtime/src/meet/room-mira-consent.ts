import { z } from 'zod';
import type { MeetRealtimeTokenPayload } from './primitives';
import {
  applyMiraRoomAcceptance,
  canAcceptMiraRoom,
  currentMiraRoomAcceptance,
  MIRA_ROOM_NOTICE_VERSION,
} from './room-mira-acceptance';
import {
  activeMiraRoomLeases,
  admittedMiraRoomAccounts,
  miraRoomRequesterReady,
  miraRoomStatus,
  recordMiraRoomChoice,
  settleMiraRoomWithdrawals,
} from './room-mira-choices';
import { miraRoomDispatch } from './room-mira-dispatch';
import type { RoomChatMessage, RoomServiceState } from './room-service';
import {
  applyMeetTranscriptConsent,
  MEET_TRANSCRIPT_NOTICE_VERSION,
} from './room-transcript-consent';

export {
  canAcceptMiraRoom,
  currentMiraRoomAcceptance,
  MIRA_ROOM_NOTICE_VERSION,
};
export * from './room-mira-choices';
export {
  fenceMiraRoomRequest,
  guardMeetTranscriptAllow,
} from './room-mira-dispatch';

type Result = { state: RoomServiceState; body: unknown; status?: number };

const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mira.room.read') }),
  z.object({
    action: z.literal('mira.room.choice'),
    choice: z.enum(['on', 'off']),
    version: z.literal(MIRA_ROOM_NOTICE_VERSION),
    // The acceptance the participant saw; 0 when none was current.
    acceptanceRevision: z.number().int().nonnegative(),
    // Where the choice was made. Only an action in the call ('confirm' or
    // 'toggle') turns an earlier off back on; a missing source counts as a
    // Join state, which never does.
    source: z.enum(['join', 'confirm', 'toggle']).optional(),
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

/** The participant's own view; acceptance details are shown to everyone. */
function miraRoomView(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  accountId: string
) {
  const acceptance = currentMiraRoomAcceptance(state);
  const own = state.miraRoom?.choices[accountId];
  const pausing = !!state.miraRoom?.pending?.[accountId];
  const current =
    !!acceptance &&
    own?.version === MIRA_ROOM_NOTICE_VERSION &&
    own.meetingId === token.meetingId &&
    own.acceptanceRevision === acceptance.revision;
  return {
    version: MIRA_ROOM_NOTICE_VERSION,
    acceptance: acceptance
      ? {
          revision: acceptance.revision,
          acceptorName: acceptance.acceptorName,
          capabilities: acceptance.capabilities,
          acceptedAt: acceptance.acceptedAt,
        }
      : null,
    choice: current ? own!.choice : null,
    // The account's own latest choice in this meeting, kept across a new
    // acceptance so the next box can start where the person left it. An
    // opt-out still settling already counts as off.
    lastChoice:
      own && own.meetingId === token.meetingId
        ? pausing
          ? 'off'
          : own.choice
        : null,
    pausing,
    ready: miraRoomRequesterReady(state, token.meetingId, accountId),
    canAccept: canAcceptMiraRoom(state, token),
    status: miraRoomStatus(state, token.meetingId),
  };
}
export type MiraRoomView = ReturnType<typeof miraRoomView>;

/**
 * Handles room Mira acceptance, choice and dispatch commands, or returns
 * null. Every command comes from the Meet Worker (`meet:server`) on behalf
 * of the token's own account; nobody chooses for someone else.
 */
export function applyMiraRoomConsent(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  now = Date.now()
): (Result & { messages?: RoomChatMessage[] }) | null {
  const acceptance = applyMiraRoomAcceptance(
    settleMiraRoomWithdrawals(state, now),
    token,
    input,
    now
  );
  if (acceptance) return acceptance;
  const parsed = command.safeParse(input);
  if (!parsed.success) return null;
  if (!token.scopes.includes('meet:server'))
    return { state, body: { error: 'Forbidden' }, status: 403 };
  const accountId = token.accountId ?? token.userId;
  // A release always ends its lease, even after the requester left, so a
  // pending opt-out never waits longer than the request itself.
  if (parsed.data.action === 'mira.room.release')
    return miraRoomDispatch(state, token, accountId, parsed.data, now);
  const settled = settleMiraRoomWithdrawals(state, now);
  const admitted = admittedMiraRoomAccounts(settled).includes(accountId);
  // Turning off always records, even while not admitted, so nobody needs to
  // be in the room to stop Mira reading them.
  const turningOff =
    parsed.data.action === 'mira.room.choice' && parsed.data.choice === 'off';
  if ((!admitted || settled.ended) && !turningOff)
    return {
      state: settled,
      body: { error: 'Join an active meeting first' },
      status: 403,
    };
  const reply = (next: RoomServiceState): Result => ({
    state: next,
    body: miraRoomView(next, token, accountId),
  });
  if (parsed.data.action === 'mira.room.read') return reply(settled);
  if (parsed.data.action === 'mira.room.dispatch')
    return miraRoomDispatch(settled, token, accountId, parsed.data, now);
  const { choice, acceptanceRevision, source } = parsed.data;
  const currentRevision = currentMiraRoomAcceptance(settled)?.revision ?? 0;
  // An on choice counts only for an acceptance that exists and that the
  // participant saw.
  if (
    choice === 'on' &&
    (!currentRevision || acceptanceRevision !== currentRevision)
  )
    return {
      state: settled,
      body: { error: 'Mira acceptance changed', code: 'MIRA_ROOM_STALE' },
      status: 409,
    };
  if (choice === 'off') return reply(turnOff(settled, token, accountId, now));
  const own = settled.miraRoom?.choices[accountId];
  const pending = settled.miraRoom?.pending?.[accountId];
  // Only an action in the call turns an earlier off, from any acceptance,
  // back on. A Join state, or a choice with no source, never does.
  if (
    source !== 'confirm' &&
    source !== 'toggle' &&
    (pending || (own?.choice === 'off' && own.meetingId === token.meetingId))
  )
    return {
      state: settled,
      body: {
        error: 'Confirm in the call to turn Mira back on',
        code: 'MIRA_ROOM_JOIN_OVER_OFF',
      },
      status: 409,
    };
  // On while pausing cancels the pause with a new revision, so requests
  // reserved before it stay stale.
  if (
    !pending &&
    own?.choice === 'on' &&
    own.version === MIRA_ROOM_NOTICE_VERSION &&
    own.meetingId === token.meetingId &&
    own.acceptanceRevision === currentRevision
  )
    return reply(settled);
  return reply(
    recordMiraRoomChoice(
      settled,
      accountId,
      token.meetingId ?? '',
      'on',
      currentRevision,
      now
    )
  );
}

/**
 * Off for one account. The transcript consent for the same account is
 * declined in the same room turn: host capture cannot separate one voice, so
 * turning Mira off pauses the live transcript for everyone.
 */
function turnOff(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  accountId: string,
  now: number
): RoomServiceState {
  const declined =
    applyMeetTranscriptConsent(
      state,
      token,
      {
        action: 'transcript.consent.choice',
        choice: 'decline',
        version: MEET_TRANSCRIPT_NOTICE_VERSION,
      },
      now
    )?.state ?? state;
  const next = declineTranscriptOutsideRoom(declined, token, accountId, now);
  const own = next.miraRoom?.choices[accountId];
  const currentRevision = currentMiraRoomAcceptance(next)?.revision ?? 0;
  if (next.miraRoom?.pending?.[accountId]) return next;
  // Already-admitted sends carrying this account finish under their lease;
  // nothing new starts, and the opt-out takes effect when they settle.
  if (own?.choice === 'on' && activeMiraRoomLeases(next, accountId, now) > 0)
    return {
      ...next,
      miraRoom: {
        ...next.miraRoom!,
        pending: {
          ...next.miraRoom?.pending,
          [accountId]: {
            requestedAt: now,
            meetingId: token.meetingId ?? '',
            acceptanceRevision: own.acceptanceRevision,
          },
        },
      },
    };
  if (
    own?.choice === 'off' &&
    own.version === MIRA_ROOM_NOTICE_VERSION &&
    own.meetingId === token.meetingId &&
    own.acceptanceRevision === currentRevision
  )
    return next;
  return recordMiraRoomChoice(
    next,
    accountId,
    token.meetingId ?? '',
    'off',
    currentRevision,
    now
  );
}

/**
 * The transcript handler records only admitted accounts. An account that left
 * still declines here, so a later rejoin never resumes capture of it.
 */
function declineTranscriptOutsideRoom(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  accountId: string,
  now: number
): RoomServiceState {
  const transcript = state.transcriptConsent ?? { choices: {} };
  const own = transcript.choices[accountId];
  if (
    own?.choice === 'decline' &&
    own.version === MEET_TRANSCRIPT_NOTICE_VERSION &&
    own.meetingId === token.meetingId
  )
    return state;
  return {
    ...state,
    transcriptConsent: {
      ...transcript,
      choices: {
        ...transcript.choices,
        [accountId]: {
          choice: 'decline',
          version: MEET_TRANSCRIPT_NOTICE_VERSION,
          meetingId: token.meetingId ?? '',
          accountId,
          recordedAt: now,
          revision: (own?.revision ?? 0) + 1,
        },
      },
    },
  };
}
