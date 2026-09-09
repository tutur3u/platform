import { connection } from 'next/server';
import { z } from 'zod';
import { MeetCallAccessError } from '@/features/call/lib/call-access';
import {
  generateMeetAssistant,
  type PrivateAssistantReview,
} from '@/features/call/server/assistant-generation';
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
    if (!new URL(request.url).searchParams.has('messageId'))
      return callRoomService(access, { action: 'ai.review.list' });
    const parsedId = z
      .string()
      .min(1)
      .max(200)
      .safeParse(new URL(request.url).searchParams.get('messageId'));
    if (!parsedId.success) throw new MeetCallAccessError(400, 'Invalid review');
    const messageId = parsedId.data;
    const review = await callRoomService<PrivateAssistantReview>(access, {
      action: 'ai.review.get',
      messageId,
    });
    // Continuation may contain private tool results and provider signatures.
    const { continuation: _, ...preview } = review;
    return preview;
  });
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    const input = z
      .object({
        messageId: z.string().min(1).max(200),
        revision: z.number().int().nonnegative(),
        action: z.enum(['approve', 'deny', 'share', 'discard']),
      })
      .safeParse(await request.json().catch(() => null));
    if (!input.success) throw new MeetCallAccessError(400, 'Invalid review');
    const { messageId, revision, action } = input.data;
    if (action === 'approve' || action === 'deny')
      return generateMeetAssistant(access, {
        messageId,
        timezone: 'UTC',
        resume: { revision, approved: action === 'approve' },
      });
    return callRoomService(access, {
      action: action === 'share' ? 'ai.review.share' : 'ai.review.discard',
      messageId,
      revision,
    });
  });
}
