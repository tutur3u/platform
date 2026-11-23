import 'server-only';
import {
  MEET_TRANSCRIPT_CONSENT_REQUIRED,
  type MeetTranscriptConsentView,
} from '@tuturuuu/realtime/meet';
import { getMeetCallAccess } from '../../call/lib/call-access';
import { callRoomService } from '../../call/server/room-service';
import { MeetAiError } from './access';

const status = (error: unknown) =>
  typeof error === 'object' && error !== null && 'status' in error
    ? Number(error.status)
    : 0;

async function hostRoom(meetingId: string, actorId: string) {
  const room = await getMeetCallAccess(meetingId, 'Participant');
  if (room.user.id !== actorId) throw new MeetAiError(409, 'Account changed');
  return room;
}

/**
 * Throws unless the chunk's session is the room's running recording and
 * every admitted participant and every source of this chunk currently allows
 * the live transcript. Runs before any usage,
 * credit, row or provider work; any room failure refuses the chunk.
 */
export async function requireMeetTranscriptFence(input: {
  meetingId: string;
  actorId: string;
  sessionId: string;
  sourceAccountIds: string[];
}) {
  let view: MeetTranscriptConsentView;
  try {
    const room = await hostRoom(input.meetingId, input.actorId);
    view = await callRoomService<MeetTranscriptConsentView>(room, {
      action: 'transcript.consent.read',
      accounts: [...new Set(input.sourceAccountIds)],
      sessionId: input.sessionId,
    });
  } catch (error) {
    if (error instanceof MeetAiError) throw error;
    throw status(error) === 403
      ? new MeetAiError(
          409,
          MEET_TRANSCRIPT_CONSENT_REQUIRED,
          'MEET_TRANSCRIPT_CONSENT_REQUIRED'
        )
      : new MeetAiError(503, 'Meeting room is unavailable');
  }
  // The chunk must belong to the session the room shows as recording.
  if (view.sessionActive !== true)
    throw new MeetAiError(409, 'Transcription has ended');
  if (view.fence?.ready !== true || view.sourcesAllowed !== true)
    throw new MeetAiError(
      409,
      MEET_TRANSCRIPT_CONSENT_REQUIRED,
      'MEET_TRANSCRIPT_CONSENT_REQUIRED'
    );
}

/**
 * Records the host's session in the room so every participant sees the
 * recording indicator. Starting fails closed; ending is best effort because
 * the room clears the indicator when the meeting ends.
 */
export async function recordMeetTranscriptSession(input: {
  meetingId: string;
  actorId: string;
  sessionId: string;
  active: boolean;
}) {
  try {
    const room = await hostRoom(input.meetingId, input.actorId);
    await callRoomService(room, {
      action: 'transcript.session',
      sessionId: input.sessionId,
      active: input.active,
    });
  } catch (error) {
    if (!input.active) {
      console.warn('[meet-ai] transcript indicator was not cleared');
      return;
    }
    throw error instanceof MeetAiError
      ? error
      : new MeetAiError(
          status(error) === 403 ? 409 : 503,
          status(error) === 403
            ? 'Join the meeting before starting the transcript'
            : 'Meeting room is unavailable'
        );
  }
}
