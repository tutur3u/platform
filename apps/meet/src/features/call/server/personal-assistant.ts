import 'server-only';
import { capMaxOutputTokensByCredits } from '@tuturuuu/ai/credits/cap-output-tokens';
import {
  checkAiCredits,
  deductAiCredits,
} from '@tuturuuu/ai/credits/check-credits';
import { answerMeetChat } from '@tuturuuu/ai/meetings/chat';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MeetCallAccessError } from '../lib/call-access';
import { getMeetChatModel } from './chat-model';
import { personalWorkspace } from './room-service';

/** No room-service call or shared history: output is returned only to this requester. */
export async function answerPersonalMeetChat(
  userId: string,
  input: {
    question: string;
    timezone: string;
    history: Array<{ body: string; assistant: boolean }>;
  }
) {
  const wsId = await personalWorkspace(userId);
  const model = await getMeetChatModel(wsId);
  const allowance = await checkAiCredits(wsId, model.id, 'chat', {
    userId,
    estimatedInputTokens: 36000,
  });
  if (!allowance.allowed)
    throw new MeetCallAccessError(403, 'AI quota is unavailable');
  const db = await createAdminClient({ noCookie: true });
  const cap = await capMaxOutputTokensByCredits(
    db,
    model.id,
    Math.min(allowance.maxOutputTokens ?? 2048, 2048),
    allowance.remainingCredits
  );
  if (!cap) throw new MeetCallAccessError(403, 'AI quota is exhausted');
  const answer = await answerMeetChat(
    input.history.map((message) => ({
      ...message,
      displayName: message.assistant ? 'Mira' : 'You',
    })),
    cap,
    input.question,
    model,
    {
      title: 'Personal conversation',
      observedAt: new Date().toISOString(),
      timezone: input.timezone,
      participantCount: 1,
      deviceCount: 1,
      participants: [],
    },
    { audience: 'private' }
  );
  if (!answer.usage.available)
    throw new MeetCallAccessError(503, 'AI usage accounting is unavailable');
  const charge = await deductAiCredits({
    wsId,
    userId,
    modelId: model.id,
    inputTokens: answer.usage.inputTokens,
    outputTokens: answer.usage.outputTokens,
    searchCount: answer.searchCount,
    feature: 'chat',
    metadata: { source: 'meet_mira_personal' },
  });
  if (!charge.success)
    throw new MeetCallAccessError(503, 'AI quota accounting failed');
  return { text: answer.text.slice(0, 16000) };
}
