import {
  getMeetCallAccess,
  MeetCallAccessError,
} from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  callRoomService,
  roomRoute,
} from '@tuturuuu/meet-core/features/call/server/room-service';
import { readMeetingRoomPolicy } from '@tuturuuu/meet-core/features/meeting-ai/server/room-access';
import { connection } from 'next/server';
import { z } from 'zod';

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
      {
        ended: policy.ended,
        canReadNotes: policy.canReadNotes,
        lifecycleVersion: policy.lifecycleVersion ?? 0,
      },
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

const restoreInput = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    expectedActorId: z.uuid(),
  })
  .strict();
export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  return roomRoute(request, (await params).meetingId, async (access) => {
    const body = restoreInput.parse(await request.json());
    if (!access.isHost)
      throw new MeetCallAccessError(
        403,
        'Only the original room owner can restore'
      );
    if (body.expectedActorId !== access.user.id)
      throw new MeetCallAccessError(409, 'Account changed');
    return callRoomService(access, {
      action: 'room.restore',
      expectedVersion: body.expectedVersion,
    });
  });
}
