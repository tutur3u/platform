import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import { readPersonalChatBody } from '@tuturuuu/meet-core/features/call/server/personal-chat-body';
import { requestPersonalMeetChat } from '@tuturuuu/meet-core/features/call/server/personal-chat-request';
import { roomRoute } from '@tuturuuu/meet-core/features/call/server/room-service';
import { z } from 'zod';

const inputSchema = z.object({
  requestId: z.uuid(),
  startedAt: z.number().int(),
  question: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        body: z.string().max(16000),
        assistant: z.boolean(),
      })
    )
    .max(20),
  timezone: z
    .string()
    .max(100)
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    })
    .default('UTC'),
});
export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    const json = await readPersonalChatBody(request);
    const input = inputSchema.safeParse(json);
    if (!input.success) throw new MeetCallAccessError(400, 'Invalid message');
    return requestPersonalMeetChat(access, input.data);
  });
}
