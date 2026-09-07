import {
  getMeetCallAccess,
  MeetCallAccessError,
} from '@/features/call/lib/call-access';
import { getMeetCallSession } from '@/features/call/lib/call-session';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  try {
    const { meetingId } = await params;
    const { user, meeting, isHost, admission, displayName } =
      await getMeetCallAccess(meetingId);
    return Response.json(
      await getMeetCallSession({
        displayName,
        isHost,
        admission,
        meetingId: meeting.id,
        userId: user.id,
        wsId: meeting.ws_id,
      }),
      { headers }
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MeetCallAccessError
            ? error.message
            : 'Call token refresh failed',
      },
      {
        status: error instanceof MeetCallAccessError ? error.status : 500,
        headers,
      }
    );
  }
}
