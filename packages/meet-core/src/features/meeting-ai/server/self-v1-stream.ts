import 'server-only';
import { MEET_TRANSCRIPT_NOTICE_VERSION } from '@tuturuuu/realtime/meet';
import { z } from 'zod';
import { MeetAiError, type MeetAiParams } from './access';
import { loadSelfSession, meetSelfAccess } from './self-v1-access';
import { drainSelfOutbox } from './self-v1-outbox';
import { selfRoom, selfRoomCommands } from './self-v1-room';
import { MeetSelfRpcError, selfRpc } from './self-v1-rpc';

const notEligible = () =>
  new MeetAiError(
    409,
    'Transcription is not available for you right now',
    'MEET_SELF_NOT_ELIGIBLE'
  );

/** Database refusals on the open path collapse to the client's fixed codes. */
function openError(error: unknown) {
  if (error instanceof MeetSelfRpcError)
    return error.status === 503
      ? new MeetAiError(
          503,
          'Meeting room is unavailable',
          'MEET_SELF_UNAVAILABLE'
        )
      : notEligible();
  return error;
}

async function readJson<T extends z.ZodType>(request: Request, schema: T) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new MeetAiError(400, 'Invalid request');
  return parsed.data as z.infer<T>;
}

/**
 * Opens the caller's own capture stream. The room checks the live fence and
 * hands out the next room sequence; pending legal entries are written first;
 * an `allow` is appended unless the latest decision already is one; the
 * stream opens with a 60 s lease; and the room commits it only if nothing
 * ended in between. A refused commit writes the room's compensating
 * withdraw at once, which closes the stream.
 */
export async function openSelfStream(request: Request, params: MeetAiParams) {
  const { db, user, wsId, meetingId } = await meetSelfAccess(request, params);
  const { sessionId } = await readJson(
    request,
    z.object({ sessionId: z.uuid() }).strict()
  );
  const session = await loadSelfSession(
    db,
    { sessionId, meetingId, wsId },
    'open'
  );
  const room = await selfRoom(meetingId, user.id);
  const begin = await selfRoomCommands.openBegin(room, session.id);
  try {
    await drainSelfOutbox(db, room, session.id, begin.pending);
    const state = await selfRpc.consentState(db, {
      sessionId: session.id,
      accountId: user.id,
    });
    const revision =
      state?.decision === 'allow'
        ? state.revision
        : (
            await selfRpc.recordDecision(db, {
              sessionId: session.id,
              accountId: user.id,
              decision: 'allow',
              noticeVersion: MEET_TRANSCRIPT_NOTICE_VERSION,
              roomSeq: begin.allowSeq,
            })
          ).revision;
    const stream = await selfRpc.openStream(db, {
      sessionId: session.id,
      accountId: user.id,
      generation: session.generation,
      consentRevision: revision,
    });
    const commit = await selfRoomCommands.openCommit(room, {
      sessionId: session.id,
      epoch: begin.epoch,
      revision,
      streamId: stream.stream_id,
    });
    if (!commit.committed) {
      await drainSelfOutbox(db, room, session.id, commit.pending).catch(() => {
        console.warn('[meet-ai] self_v1 open compensation pending');
      });
      throw notEligible();
    }
    return {
      streamId: stream.stream_id,
      consentRevision: revision,
      leaseExpiresAt: stream.lease_expires_at,
    };
  } catch (error) {
    throw openError(error);
  }
}

/** Renews the caller's own live stream lease; a stream id alone grants nothing. */
export async function renewSelfStream(request: Request, params: MeetAiParams) {
  const { db, user, wsId, meetingId } = await meetSelfAccess(request, params);
  const { sessionId, streamId } = await readJson(
    request,
    z.object({ sessionId: z.uuid(), streamId: z.uuid() }).strict()
  );
  await loadSelfSession(db, { sessionId, meetingId, wsId }, 'upload');
  try {
    const leaseExpiresAt = await selfRpc.renewStream(db, {
      streamId,
      accountId: user.id,
    });
    return { leaseExpiresAt };
  } catch (error) {
    throw openError(error);
  }
}
