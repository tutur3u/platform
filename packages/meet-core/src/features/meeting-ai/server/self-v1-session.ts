import 'server-only';
import type { MiraRoomView } from '@tuturuuu/realtime/meet';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { callRoomService } from '../../call/server/room-service';
import { MeetAiError } from './access';
import { meetPerSpeakerEnabled } from './per-speaker-flag';
import { drainSelfOutbox } from './self-v1-outbox';
import { selfRoom, selfRoomCommands, selfRoomError } from './self-v1-room';
import { type MeetAiSessionRow, selfRpc } from './self-v1-rpc';
import { generateSelfNotes } from './self-v1-notes';
import { requireMeetTranscriptPayer } from './transcript-authority';

type HostInput = {
  db: TypedSupabaseClient;
  meetingId: string;
  wsId: string;
  hostId: string;
};

const unavailable = () =>
  new MeetAiError(
    403,
    'Transcription of each voice is not available here',
    'MEET_SELF_UNAVAILABLE'
  );

/**
 * Starts a per-speaker session for the host, after the availability gate
 * already checked by the caller: the flag and allowlist, the host payer and
 * the room's current Mira acceptance. The room records the session with its
 * protocol and generation and refuses it unless its mode is per-speaker.
 * A session the room does not record is closed at once.
 */
export async function startSelfSession(input: HostInput) {
  const { db, meetingId, wsId, hostId } = input;
  if (!(await meetPerSpeakerEnabled(wsId))) throw unavailable();
  await requireMeetTranscriptPayer({ userId: hostId, wsId, meetingId });
  const room = await selfRoom(meetingId, hostId);
  let mira: MiraRoomView;
  try {
    mira = await callRoomService<MiraRoomView>(room.access, {
      action: 'mira.room.read',
    });
  } catch (error) {
    throw selfRoomError(error);
  }
  if (!mira?.acceptance)
    throw new MeetAiError(
      409,
      'Turn on Mira for the meeting before transcribing',
      'MEET_SELF_MIRA_REQUIRED'
    );
  const session = await selfRpc
    .startSession(db, { meetingId, hostId, wsId })
    .catch((error) => {
      throw error instanceof MeetAiError && error.status === 409
        ? new MeetAiError(409, 'A transcription session is already running')
        : error;
    });
  try {
    const recorded = await selfRoomCommands.recordSession(room, {
      sessionId: session.id,
      active: true,
      generation: session.generation,
    });
    await drainSelfOutbox(db, room, session.id, recorded.pending).catch(() => {
      console.warn('[meet-ai] self_v1 start drain pending');
    });
  } catch (error) {
    await selfRpc
      .stopSession(db, { sessionId: session.id, hostId, hard: true })
      .catch(() => {
        console.error('[meet-ai] self_v1 session close after refusal failed');
      });
    throw error;
  }
  return { sessionId: session.id, protocol: 'self_v1' as const };
}

async function endInRoom(
  db: TypedSupabaseClient,
  input: { meetingId: string; hostId: string; session: MeetAiSessionRow }
) {
  try {
    const room = await selfRoom(input.meetingId, input.hostId);
    const ended = await selfRoomCommands.recordSession(room, {
      sessionId: input.session.id,
      active: false,
      generation: input.session.generation,
    });
    await drainSelfOutbox(db, room, input.session.id, ended.pending);
  } catch {
    // The database stop is the durable fence; the room clears on meeting end.
    console.warn('[meet-ai] self_v1 room stop pending');
  }
}

/**
 * Stops a per-speaker session and, once its drain window has passed and no
 * dispatched chunk is still in flight, generates the notes. Stop sets the
 * durable fence first. A kill switch or flag off stops hard and drains
 * nothing.
 */
export async function finishSelfSession(
  input: HostInput & {
    session: MeetAiSessionRow;
    meetingStartedAt: string;
    timezone?: string;
  }
) {
  const { db, meetingId, hostId } = input;
  let session = input.session;
  const enabled = await meetPerSpeakerEnabled(input.wsId);
  if (session.capture_state === 'active' || (!enabled && !session.ended_at)) {
    session = await selfRpc.stopSession(db, {
      sessionId: session.id,
      hostId,
      hard: !enabled,
    });
    await endInRoom(db, { meetingId, hostId, session });
  }
  if (!enabled) throw unavailable();
  if (
    session.capture_state === 'draining' &&
    session.drain_deadline_at &&
    Date.parse(session.drain_deadline_at) > Date.now()
  )
    throw new MeetAiError(409, 'Audio is still processing');
  session = await selfRpc.closeDrained(db, session.id);
  const inFlight = await db
    .from('meet_ai_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .eq('status', 'processing')
    .gt('attempt_started_at', new Date(Date.now() - 90_000).toISOString());
  if (inFlight.error) throw new MeetAiError(500, 'Transcript lookup failed');
  if ((inFlight.count ?? 0) > 0)
    throw new MeetAiError(409, 'Audio is still processing');
  return generateSelfNotes({
    db,
    session,
    meetingId,
    meetingStartedAt: input.meetingStartedAt,
    timezone: input.timezone,
  });
}
