import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { guestPollRoomRoute } from '@tuturuuu/meet-core/features/call/server/room-service';
import {
  joinMeetingWhiteboard,
  listMeetingWhiteboards,
  runMeetingWhiteboardAction,
  whiteboardActionSchema,
} from '@tuturuuu/meet-core/features/call/server/whiteboard';
import { connection } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  await connection();
  return guestPollRoomRoute(request, (await params).meetingId, (access) =>
    listMeetingWhiteboards(access)
  );
}

/** Guests may only join a board; link management is for signed-in members. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  await connection();
  const { meetingId } = await params;
  return guestPollRoomRoute(request, meetingId, async (access) => {
    const action = whiteboardActionSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!action.success)
      throw new MeetCallAccessError(400, 'Invalid whiteboard request');
    return action.data.action === 'join'
      ? joinMeetingWhiteboard(access, action.data.boardId)
      : runMeetingWhiteboardAction(access, action.data);
  });
}
