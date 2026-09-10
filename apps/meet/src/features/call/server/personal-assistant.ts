import 'server-only';
import { capMaxOutputTokensByCredits } from '@tuturuuu/ai/credits/cap-output-tokens';
import {
  checkAiCredits,
  deductAiCredits,
} from '@tuturuuu/ai/credits/check-credits';
import {
  releaseFixedAiCreditReservation,
  reserveFixedAiCredits,
} from '@tuturuuu/ai/credits/reservations';
import { answerMeetChat } from '@tuturuuu/ai/meetings/chat';
import { calculateAiStudioUsageCost } from '@tuturuuu/ai/studio/metering';
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
  const estimatedContextTokens = Math.ceil(contextBytes / 3);
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
  const estimate = await calculateAiStudioUsageCost({
    workspaceId: wsId,
    modelId: model.id,
    inputTokens: inputBudget,
    outputTokens: 4 * cap,
    reasoningTokens: 4 * cap,
    searchCount: 0,
  });
  const reservation = await reserveFixedAiCredits(
    {
      wsId,
      userId,
      amount: estimate.billedCredits,
      modelId: model.id,
      feature: 'chat',
      expiresInSeconds: 300,
      metadata: { source: 'meet_mira_personal' },
    },
    db
  );
  if (!reservation.success || !reservation.reservationId)
    throw new MeetCallAccessError(403, 'AI quota is exhausted');
  const holds = [reservation.reservationId];
  const beforeSearch = async () => {
    const cost = await calculateAiStudioUsageCost({
      workspaceId: wsId,
      modelId: model.id,
      // Native grounding can bill several queries from one tool invocation.
      searchCount: 10,
    });
    if (cost.billedCredits <= 0) return;
    const hold = await reserveFixedAiCredits(
      {
        wsId,
        userId,
        amount: cost.billedCredits,
        modelId: model.id,
        feature: 'chat',
        expiresInSeconds: 300,
        metadata: { source: 'meet_mira_personal_search' },
      },
      db
    );
    if (!hold.success || !hold.reservationId)
      throw new MeetCallAccessError(403, 'AI search quota is exhausted');
    holds.push(hold.reservationId);
  };
  try {
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
      { audience: 'private', beforeSearch }
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
  } finally {
    // Keep the hold through actual deduction: releasing first opens a spending race.
    // Failed release remains a short-lived hold; never re-run a successful deduction.
    for (const id of holds) {
      const released = await releaseFixedAiCreditReservation(
        id,
        { wsId, userId, source: 'meet_mira_personal' },
        db
      ).catch(() => ({ success: false }));
      if (!released.success)
        console.warn('Meet private AI reservation release pending');
    }
  }
}
