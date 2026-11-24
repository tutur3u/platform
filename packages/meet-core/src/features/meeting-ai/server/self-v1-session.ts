import 'server-only';
import type { MiraRoomView } from '@tuturuuu/realtime/meet';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { MEETING_APP } from '../../../runtime';
import { callRoomService } from '../../call/server/room-service';
import { MeetAiError } from './access';
import { meetPerSpeakerEnabled } from './per-speaker-flag';
import { drainSelfOutbox } from './self-v1-outbox';
import { closeSessionEndedByRoom } from './self-v1-room-end';
import {
  type MeetSelfRoom,
  selfRoom,
  selfRoomCommands,
  selfRoomError,
} from './self-v1-room';
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
 * The protocol a new session takes from the room's capture mode. Outside the
 * Meet app, or when the room cannot be read, it is room capture; the room
 * still refuses a room-capture start while it is set to per-speaker.
 */
export async function roomCaptureProtocol(
  meetingId: string,
  hostId: string
): Promise<'legacy' | 'self_v1'> {
  if (MEETING_APP !== 'meet') return 'legacy';
  try {
    const room = await selfRoom(meetingId, hostId);
    const view = await callRoomService<{ mode?: unknown }>(room.access, {
      action: 'transcript.consent.read',
    });
    return view?.mode === 'self' ? 'self_v1' : 'legacy';
  } catch {
    return 'legacy';
  }
}

/** How long a new session may take to appear in the room. */
export const SELF_SESSION_SETTLE_MS = 30_000;

const alreadyRunning = () =>
  new MeetAiError(409, 'A transcription session is already running');

/**
 * Starts the database session. When one is still open but the room no
 * longer runs it (the room ended or was restored), that session is never
 * reused: it is stopped and closed, and a new one starts.
 */
async function startFresh(
  db: TypedSupabaseClient,
  room: MeetSelfRoom,
  input: { meetingId: string; hostId: string; wsId: string }
) {
  const start = () =>
    selfRpc.startSession(db, input).catch((error) => {
      throw error instanceof MeetAiError && error.status === 409
        ? alreadyRunning()
        : error;
    });
  try {
    return await start();
  } catch (error) {
    if (!(error instanceof MeetAiError) || error.status !== 409) throw error;
  }
  const { data: open, error } = await db
    .from('meet_ai_sessions')
    .select('id, user_id, capture_state, protocol, created_at')
    .eq('meeting_id', input.meetingId)
    .is('ended_at', null)
    .maybeSingle();
  if (error) throw new MeetAiError(500, 'Session lookup failed');
  if (!open || open.protocol !== 'self_v1') throw alreadyRunning();
  // A session this young may still be on its way into the room; never close
  // it as stale. The host retries after the room has recorded it.
  if (Date.now() - Date.parse(open.created_at) < SELF_SESSION_SETTLE_MS)
    throw alreadyRunning();
  let roomSession: unknown;
  try {
    roomSession = (
      await callRoomService<{ session?: { sessionId?: unknown } | null }>(
        room.access,
        { action: 'transcript.consent.read' }
      )
    )?.session;
  } catch (roomError) {
    throw selfRoomError(roomError);
  }
  if ((roomSession as { sessionId?: unknown } | null)?.sessionId === open.id)
    throw alreadyRunning();
  await closeSessionEndedByRoom(db, open);
  return start();
}

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
  const session = await startFresh(db, room, { meetingId, hostId, wsId });
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
