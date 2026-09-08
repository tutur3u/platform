import { connection } from 'next/server';
import { MeetCallAccessError } from '@/features/call/lib/call-access';
import {
  callRoomService,
  roomRoute,
} from '@/features/call/server/room-service';
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
