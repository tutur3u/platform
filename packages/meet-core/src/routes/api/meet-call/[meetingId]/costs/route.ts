import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  callRoomService,
  roomRoute,
} from '@tuturuuu/meet-core/features/call/server/room-service';
import { connection } from 'next/server';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  await connection();
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    if (!access.isHost)
      throw new MeetCallAccessError(403, 'Only room admins can view costs');
    return callRoomService(access, { action: 'costs' });
  });
}
