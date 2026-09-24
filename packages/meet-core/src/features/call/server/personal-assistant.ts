import 'server-only';
import { capMaxOutputTokensByCredits } from '@tuturuuu/ai/credits/cap-output-tokens';
import { checkAiCredits } from '@tuturuuu/ai/credits/check-credits';
import { answerMeetChat } from '@tuturuuu/ai/meetings/chat';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MEETING_APP } from '../../../runtime';
import { meetingProviderTransport } from '../../meeting-ai/server/provider-transport';
import { MeetCallAccessError } from '../lib/call-access';
import { billMeetChat } from './chat-billing';
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
  const contextBytes = new TextEncoder().encode(
    JSON.stringify({
      question: input.question,
      history: input.history.map((message) => ({
        ...message,
        body: message.body.slice(0, 1250),
      })),
    })
  ).byteLength;
  // Reserve repeated context across the bounded tool loop, not a flat maximum
  // for every short question. Output and tool-result headroom remain bounded.
  const estimatedContextTokens = contextBytes;
  const inputBudget = 3 * (estimatedContextTokens + 6000) + 8192;
  const wsId = await personalWorkspace(userId);
  const model = await getMeetChatModel(wsId);
  const allowance = await checkAiCredits(wsId, model.id, 'chat', {
    userId,
    estimatedInputTokens: inputBudget,
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
  const answer = await billMeetChat(
    {
      userId,
      workspaceId: wsId,
      model,
      maxOutputTokens: cap,
      inputBudget,
      remainingCredits: allowance.remainingCredits,
      requestId: crypto.randomUUID(),
      allowSearch: MEETING_APP !== 'parley',
    },
    async (allowSearch) =>
      answerMeetChat(
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
        {
          audience: 'private',
          provider: await meetingProviderTransport(),
          allowSearch,
        }
      )
  );
  if (!answer.text.trim())
    throw new MeetCallAccessError(
      503,
      'AI returned no answer. Please try again.'
    );
  return { text: answer.text.slice(0, 16000) };
}
