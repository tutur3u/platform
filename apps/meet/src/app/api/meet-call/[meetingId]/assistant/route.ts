import { capMaxOutputTokensByCredits } from '@tuturuuu/ai/credits/cap-output-tokens';
import {
  checkAiCredits,
  deductAiCredits,
} from '@tuturuuu/ai/credits/check-credits';
import { answerMeetChat } from '@tuturuuu/ai/meetings/chat';
import { MEET_AI_MODEL } from '@tuturuuu/ai/meetings/usage';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import { MeetCallAccessError } from '@/features/call/lib/call-access';
import {
  callRoomService,
  personalWorkspace,
  roomRoute,
} from '@/features/call/server/room-service';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    const input = z
      .object({ messageId: z.string().min(1).max(200) })
      .safeParse(await request.json());
    if (!input.success) throw new MeetCallAccessError(400, 'Invalid message');
    const { messageId } = input.data;
    const wsId = await personalWorkspace(access.user.id);
    const allowance = await checkAiCredits(wsId, MEET_AI_MODEL, 'chat', {
      userId: access.user.id,
      estimatedInputTokens: 16000,
    });
    if (!allowance.allowed)
      throw new MeetCallAccessError(
        403,
        allowance.errorMessage ?? 'AI quota is unavailable'
      );
    const db = await createAdminClient({ noCookie: true });
    const cap = await capMaxOutputTokensByCredits(
      db,
      MEET_AI_MODEL,
      Math.min(allowance.maxOutputTokens ?? 2048, 2048),
      allowance.remainingCredits
    );
    if (!cap) throw new MeetCallAccessError(403, 'AI quota is exhausted');
    const context = await callRoomService<{
      chat: Array<{ body: string; displayName: string; assistant?: boolean }>;
      prompt: string;
    }>(access, { action: 'ai.reserve', messageId });
    let costUsd: number | null = null;
    try {
      const answer = await answerMeetChat(context.chat, cap, context.prompt);
      costUsd = answer.costUsd;
      if (
        !answer.usage.available ||
        !('inputTokens' in answer.usage) ||
        !('outputTokens' in answer.usage) ||
        typeof answer.usage.inputTokens !== 'number' ||
        typeof answer.usage.outputTokens !== 'number'
      )
        throw new MeetCallAccessError(
          503,
          'AI usage accounting is unavailable'
        );
      const charge = await deductAiCredits({
        wsId,
        userId: access.user.id,
        modelId: MEET_AI_MODEL,
        inputTokens: answer.usage.inputTokens,
        outputTokens: answer.usage.outputTokens,
        feature: 'chat',
        metadata: { source: 'meet_mira', meetingId, messageId },
      });
      if (!charge.success)
        throw new MeetCallAccessError(503, 'AI quota accounting failed');
      await callRoomService(access, {
        action: 'ai.finish',
        messageId,
        body: answer.text.slice(0, 16000),
        costUsd,
      });
      return { ok: true };
    } catch (error) {
      await callRoomService(access, {
        action: 'ai.finish',
        messageId,
        costUsd,
      }).catch(() => undefined);
      throw error;
    }
  });
}
