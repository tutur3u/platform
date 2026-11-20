import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
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

/**
 * Room chat @mira. Generation requires room Mira authority (eligible account,
 * attested meeting workspace) and the all-participant Continue fence.
 */
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
      .strict()
      .safeParse(await request.json().catch(() => null));
    if (!input.success) throw new MeetCallAccessError(400, 'Invalid message');
    const { generateMeetAssistant } =
      await import('@tuturuuu/meet-core/features/call/server/assistant-generation');
    return generateMeetAssistant(access, input.data);
  });
}
