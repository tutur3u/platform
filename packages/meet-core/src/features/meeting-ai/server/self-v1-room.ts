import 'server-only';
import { getMeetCallAccess } from '../../call/lib/call-access';
import {
  callRoomService,
  type MeetCallRouteAccess,
} from '../../call/server/room-service';
import { MeetAiError } from './access';

/** One pending legal write the room asks the Meet Worker to record. */
export type MeetSelfOutboxEntry = {
  sessionId: string;
  accountId: string;
  seq: number;
  kind: 'withdraw' | 'revoke' | 'close';
  noticeVersion?: string;
};

export type MeetSelfRoom = {
  access: MeetCallRouteAccess;
  accountId: string;
};

const status = (error: unknown) =>
  typeof error === 'object' && error !== null && 'status' in error
    ? Number(error.status)
    : 0;

/** Room refusals become fixed client codes; room text never passes through. */
export function selfRoomError(error: unknown) {
  if (error instanceof MeetAiError) return error;
  const code = status(error);
  if (code === 429)
    return new MeetAiError(
      409,
      'Too many changes; try again shortly',
      'MEET_SELF_RATE_LIMITED'
    );
  if (code === 403 || code === 409)
    return new MeetAiError(
      409,
      'Transcription is not available for you right now',
      'MEET_SELF_NOT_ELIGIBLE'
    );
  return new MeetAiError(
    503,
    'Meeting room is unavailable',
    'MEET_SELF_UNAVAILABLE'
  );
}

/**
 * The signed-in actor's own room channel. Commands run for the token's own
 * account, so nobody can act for another participant.
 */
export async function selfRoom(
  meetingId: string,
  actorId: string
): Promise<MeetSelfRoom> {
  let access: MeetCallRouteAccess;
  try {
    access = await getMeetCallAccess(meetingId, 'Participant');
  } catch (error) {
    throw selfRoomError(error);
  }
  if (access.user.id !== actorId) throw new MeetAiError(409, 'Account changed');
  return { access, accountId: actorId };
}

async function send<T>(
  room: MeetSelfRoom,
  command: Record<string, unknown>,
  options?: { coHost?: boolean }
) {
  try {
    return await callRoomService<T>(room.access, command, options);
  } catch (error) {
    throw selfRoomError(error);
  }
}

const pendingOf = (value: unknown): MeetSelfOutboxEntry[] =>
  Array.isArray(value) ? (value as MeetSelfOutboxEntry[]) : [];

export const selfRoomCommands = {
  /**
   * A refusal answers 200 with `allowed: false` so its pending entries still
   * arrive; an allowed reply carries the room sequence and notice version to
   * record the allow under.
   */
  async openBegin(room: MeetSelfRoom, sessionId: string) {
    const reply = await send<{
      allowed?: boolean;
      reason?: string;
      epoch?: number;
      allowSeq?: number;
      noticeVersion?: string;
      pending?: MeetSelfOutboxEntry[];
    }>(room, { action: 'transcription.self.openBegin', sessionId });
    const pending = pendingOf(reply?.pending);
    if (reply?.allowed !== true)
      return {
        allowed: false as const,
        reason: typeof reply?.reason === 'string' ? reply.reason : undefined,
        pending,
      };
    if (
      !Number.isSafeInteger(reply.epoch) ||
      !Number.isSafeInteger(reply.allowSeq) ||
      typeof reply.noticeVersion !== 'string' ||
      !reply.noticeVersion
    )
      throw selfRoomError(null);
    return {
      allowed: true as const,
      epoch: reply.epoch as number,
      allowSeq: reply.allowSeq as number,
      noticeVersion: reply.noticeVersion,
      pending,
    };
  },

  async openCommit(
    room: MeetSelfRoom,
    input: {
      sessionId: string;
      epoch: number;
      revision: number;
      streamId: string;
    }
  ) {
    const reply = await send<{
      committed?: boolean;
      pending?: MeetSelfOutboxEntry[];
    }>(room, { action: 'transcription.self.openCommit', ...input });
    return {
      committed: reply?.committed === true,
      pending: pendingOf(reply?.pending),
    };
  },

  async authorize(
    room: MeetSelfRoom,
    input: {
      sessionId: string;
      streamId: string;
      consentRevision: number;
      spend: boolean;
    }
  ) {
    const reply = await send<{
      allowed?: boolean;
      reason?: string;
      pending?: MeetSelfOutboxEntry[];
    }>(room, { action: 'transcription.self.authorize', ...input });
    return {
      allowed: reply?.allowed === true,
      reason: typeof reply?.reason === 'string' ? reply.reason : undefined,
      pending: pendingOf(reply?.pending),
    };
  },

  async ack(
    room: MeetSelfRoom,
    sessionId: string,
    entries: Array<{ accountId: string; seq: number }>
  ) {
    if (!entries.length) return;
    await send(room, { action: 'transcription.self.ack', sessionId, entries });
  },

  async setMode(
    room: MeetSelfRoom,
    mode: 'room' | 'self',
    options: { coHost: boolean }
  ) {
    try {
      return await callRoomService<{ mode?: string }>(
        room.access,
        { action: 'transcript.mode.set', mode },
        options.coHost ? { coHost: true } : undefined
      );
    } catch (error) {
      const code = status(error);
      if (code === 409)
        throw new MeetAiError(
          409,
          'The capture mode is locked while transcription runs',
          'MEET_SELF_MODE_LOCKED'
        );
      if (code === 403)
        throw new MeetAiError(
          403,
          'Only the host or a co-host can change the capture mode'
        );
      if (code === 412)
        throw new MeetAiError(
          409,
          'Transcription of each voice is not available here',
          'MEET_SELF_UNAVAILABLE'
        );
      throw selfRoomError(error);
    }
  },

  /** Records a self_v1 session in the room; the room checks mode and acceptance. */
  async recordSession(
    room: MeetSelfRoom,
    input: {
      sessionId: string;
      active: boolean;
      generation: number;
    }
  ) {
    const reply = await send<{ pending?: MeetSelfOutboxEntry[] }>(room, {
      action: 'transcript.session',
      sessionId: input.sessionId,
      active: input.active,
      protocol: 'self_v1',
      generation: input.generation,
    });
    return { pending: pendingOf(reply?.pending) };
  },
};
