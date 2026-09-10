import { z } from 'zod';
import { MeetCallAccessError } from '@/features/call/lib/call-access';
import { answerPersonalMeetChat } from '@/features/call/server/personal-assistant';
import { readPersonalChatBody } from '@/features/call/server/personal-chat-body';
import { roomRoute } from '@/features/call/server/room-service';

const inputSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        body: z.string().max(16000),
        assistant: z.boolean(),
      })
    )
    .max(20),
  timezone: z.string().max(100).default('UTC'),
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
    return answerPersonalMeetChat(access.user.id, input.data);
  });
}
