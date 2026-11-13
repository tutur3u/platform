import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { roomRoute } from '@tuturuuu/meet-core/features/call/server/room-service';
export async function POST(
  request: Request,
  context: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await context.params;
  return roomRoute(request, meetingId, async () => {
    throw new MeetCallAccessError(
      403,
      'Workspace and room actions are unavailable in Private Mira.'
    );
  });
}
