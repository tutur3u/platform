import {
  getMeetCallAccess,
  MeetCallAccessError,
} from '@tuturuuu/meet-core/features/call/lib/call-access';
import { readMeetingRoomPolicy } from '@tuturuuu/meet-core/features/meeting-ai/server/room-access';
import { connection } from 'next/server';

/** Read room lifecycle without joining or revealing notes to an unapproved user. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  await connection();
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const { meetingId } = await params;
    const { user, meeting, isHost } = await getMeetCallAccess(
      meetingId,
      'Participant'
    );
    const policy = await readMeetingRoomPolicy({
      meetingId,
      wsId: meeting.ws_id,
      userId: user.id,
      isHost,
    });
    return Response.json(
      { ended: policy.ended, canReadNotes: policy.canReadNotes },
      { headers }
    );
  } catch (error) {
    return Response.json(
      { error: 'Meeting state unavailable' },
      {
        status: error instanceof MeetCallAccessError ? error.status : 503,
        headers,
      }
    );
  }
}
