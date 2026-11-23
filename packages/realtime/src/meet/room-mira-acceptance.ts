import { z } from 'zod';
import { MEET_ASSISTANT_USER_ID } from './assistant-mentions';
import { retainRoomChat } from './chat-retention';
import { MEET_CLASS_COHOST_SCOPE } from './class-timer';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { RoomChatMessage, RoomServiceState } from './room-service';

/**
 * Host acceptance for room Mira. Only the session host or a co-host who is
 * admitted and present accepts, never a guest. The meeting workspace's 18+
 * declaration and the acceptor's own confirmation are checked by the Meet
 * Worker before it allocates the durable revision; the room checks presence
 * and role and keeps revisions monotonic. Ending an acceptance, a new notice
 * version or any expansion makes every earlier choice stale.
 */
export const MIRA_ROOM_NOTICE_VERSION = '2026-11-24-room-v2';
export const MIRA_ROOM_CAPABILITIES = ['chat', 'captions', 'notes'] as const;
export type MiraRoomCapability = (typeof MIRA_ROOM_CAPABILITIES)[number];

export type MiraRoomAcceptance = {
  revision: number;
  acceptorAccountId: string;
  /** The acceptor's server-side profile name, shown to every participant. */
  acceptorName: string;
  capabilities: MiraRoomCapability[];
  noticeVersion: string;
  acceptedAt: number;
};

export type MiraRoomEndReason = 'turned_off' | 'minor_reported';

export const miraRoomAcceptanceCommand = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('mira.room.accept'),
    // Allocated durably per meeting by the Meet Worker.
    revision: z.number().int().positive(),
    capabilities: z
      .array(z.enum(MIRA_ROOM_CAPABILITIES))
      .min(1)
      .max(MIRA_ROOM_CAPABILITIES.length),
    noticeVersion: z.literal(MIRA_ROOM_NOTICE_VERSION),
    audienceAdultConfirmed: z.literal(true),
  }),
  z.object({
    action: z.literal('mira.room.end'),
    reason: z.enum(['turned_off', 'minor_reported']),
  }),
]);

const accountOf = (person: { accountId?: string; userId: string }) =>
  person.accountId ?? person.userId;

export function currentMiraRoomAcceptance(state: RoomServiceState) {
  const acceptance = state.miraRoom?.acceptance;
  return !state.ended &&
    acceptance &&
    acceptance.noticeVersion === MIRA_ROOM_NOTICE_VERSION
    ? acceptance
    : null;
}

/** Presence entries of an account, which proves it is admitted and present. */
function presenceOf(state: RoomServiceState, accountId: string) {
  return Object.values(state.presence).find(
    (person) => accountOf(person) === accountId
  );
}

/** Host or co-host, signed in, admitted and present in an active meeting. */
export function canAcceptMiraRoom(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload
) {
  const accountId = token.accountId ?? token.userId;
  return (
    !state.ended &&
    token.guest !== true &&
    token.participantKind !== 'guest' &&
    (token.role === 'host' || token.scopes.includes(MEET_CLASS_COHOST_SCOPE)) &&
    !!presenceOf(state, accountId)
  );
}

function systemLine(
  state: RoomServiceState,
  notice: NonNullable<RoomChatMessage['notice']>,
  body: string
): RoomChatMessage {
  return {
    type: 'chat.message',
    retained: state.settings?.saveChat !== false,
    id: crypto.randomUUID(),
    userId: MEET_ASSISTANT_USER_ID,
    displayName: 'Mira',
    assistant: true,
    notice,
    body,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Transcript Allows count only under the acceptance they were given for. A
 * new, replaced or ended acceptance drops every Allow, so the live
 * transcript pauses until participants confirm again. Declines stay.
 */
function withoutTranscriptAllows(state: RoomServiceState): RoomServiceState {
  const transcript = state.transcriptConsent;
  if (!transcript) return state;
  return {
    ...state,
    transcriptConsent: {
      ...transcript,
      choices: Object.fromEntries(
        Object.entries(transcript.choices).filter(
          ([, choice]) => choice.choice !== 'allow'
        )
      ),
    },
  };
}

type Result = {
  state: RoomServiceState;
  body: unknown;
  status?: number;
  messages?: RoomChatMessage[];
};

/**
 * Handles `mira.room.accept` and `mira.room.end`, or returns null. Ending
 * clears the acceptance; the revision counter only grows, so admitted
 * dispatch leases bound to the ended revision are refused and discarded.
 */
export function applyMiraRoomAcceptance(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  now = Date.now()
): Result | null {
  const parsed = miraRoomAcceptanceCommand.safeParse(input);
  if (!parsed.success) return null;
  if (!token.scopes.includes('meet:server'))
    return { state, body: { error: 'Forbidden' }, status: 403 };
  const accountId = token.accountId ?? token.userId;
  const room = state.miraRoom ?? { choices: {} };
  const current = currentMiraRoomAcceptance(state);
  if (parsed.data.action === 'mira.room.end') {
    // Anyone present may report a minor; only an acceptor may turn Mira off.
    const allowed =
      parsed.data.reason === 'minor_reported'
        ? !state.ended && !!presenceOf(state, accountId)
        : canAcceptMiraRoom(state, token);
    if (!allowed)
      return { state, body: { error: 'Forbidden' }, status: 403 };
    if (!current) return { state, body: { endedRevision: null } };
    const next = withoutTranscriptAllows({
      ...state,
      miraRoom: { ...room, acceptance: null },
    });
    const line = systemLine(next, { kind: 'mira.off' }, 'Mira is off.');
    return {
      state: { ...next, chat: retainRoomChat([...(next.chat ?? []), line]) },
      body: { endedRevision: current.revision },
      messages: [line],
    };
  }
  if (!canAcceptMiraRoom(state, token))
    return {
      state,
      body: {
        error: 'Only the host or a co-host in the meeting can turn on Mira',
      },
      status: 403,
    };
  const { revision, capabilities } = parsed.data;
  if (revision <= (room.lastRevision ?? 0))
    return {
      state,
      body: { error: 'Mira acceptance changed', code: 'MIRA_ROOM_STALE' },
      status: 409,
    };
  const acceptorName =
    token.displayName?.trim() ||
    presenceOf(state, accountId)?.displayName ||
    'Host';
  const acceptance: MiraRoomAcceptance = {
    revision,
    acceptorAccountId: accountId,
    acceptorName,
    capabilities: [...new Set(capabilities)],
    noticeVersion: MIRA_ROOM_NOTICE_VERSION,
    acceptedAt: now,
  };
  const next = withoutTranscriptAllows({
    ...state,
    miraRoom: { ...room, acceptance, lastRevision: revision },
  });
  const line = systemLine(
    next,
    { kind: 'mira.on', by: acceptorName },
    `Mira is on, turned on by ${acceptorName}.`
  );
  return {
    state: { ...next, chat: retainRoomChat([...(next.chat ?? []), line]) },
    body: {
      revision,
      acceptorName,
      replacedRevision: current?.revision ?? null,
    },
    messages: [line],
  };
}
