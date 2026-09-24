import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { generateMeetAssistant } from '@tuturuuu/meet-core/features/call/server/assistant-generation';
import { roomRoute } from '@tuturuuu/meet-core/features/call/server/room-service';
import { z } from 'zod';

const timezone = z
  .string()
  .max(100)
  .refine((zone) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  });
export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    const input = z
      .object({
        messageId: z.string().min(1).max(200),
        timezone: timezone.default('UTC'),
        workspaceId: z.uuid().optional(),
      })
      .safeParse(await request.json().catch(() => null));
    if (!input.success) throw new MeetCallAccessError(400, 'Invalid message');
    return generateMeetAssistant(access, input.data);
  });
}
