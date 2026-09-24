import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { roomRoute } from '@tuturuuu/meet-core/features/call/server/room-service';
import { readMeetingRoomPolicy } from '@tuturuuu/meet-core/features/meeting-ai/server/room-access';
import { connection } from 'next/server';
import { z } from 'zod';

type Context = { params: Promise<{ meetingId: string }> };
export async function GET(request: Request, { params }: Context) {
  await connection();
  return handle(request, (await params).meetingId);
}
export async function PATCH(request: Request, { params }: Context) {
  return handle(request, (await params).meetingId);
}
function handle(request: Request, meetingId: string) {
  return roomRoute(request, meetingId, async (access) => {
    if (!access.isHost)
      throw new MeetCallAccessError(
        403,
        'Only the host can manage public details'
      );
    const patch =
      request.method === 'PATCH'
        ? z
            .object({ publicLinkPreview: z.boolean() })
            .strict()
            .safeParse(await request.json().catch(() => null))
        : null;
    if (patch && !patch.success)
      throw new MeetCallAccessError(400, 'Invalid visibility setting');
    const result = await readMeetingRoomPolicy(
      {
        meetingId,
        wsId: access.meeting.ws_id,
        userId: access.user.id,
        isHost: true,
      },
      patch?.success ? patch.data : undefined
    );
    return {
      publicLinkPreview: result.settings?.publicLinkPreview === true,
      title: access.meeting.name,
    };
  });
}
