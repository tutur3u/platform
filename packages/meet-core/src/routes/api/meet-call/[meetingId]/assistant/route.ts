import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { roomRoute } from '@tuturuuu/meet-core/features/call/server/room-service';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async () => {
    throw new MeetCallAccessError(
      403,
      'Room AI chat is unavailable. Use Private Mira after choosing Continue.'
    );
  });
}
