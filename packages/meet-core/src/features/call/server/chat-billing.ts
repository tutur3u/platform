import 'server-only';
import type { answerMeetChat } from '@tuturuuu/ai/meetings/chat';
import type { MeetChatModel } from '@tuturuuu/ai/meetings/chat-usage';
import {
  beginAiStudioRun,
  calculateAiStudioUsageCost,
  recordAiStudioRunStep,
  settleAiStudioRun,
} from '@tuturuuu/ai/studio/metering';
import { Effect } from '@tuturuuu/utils/effect';
import { MEETING_APP } from '../../../runtime';
import { MeetCallAccessError } from '../lib/call-access';

type Answer = Awaited<ReturnType<typeof answerMeetChat>>;
/** Charge the reservation itself, never a second deduction against held credits. */
export async function billMeetChat(
  input: {
    userId: string;
    workspaceId: string;
    model: MeetChatModel;
    maxOutputTokens: number;
    inputBudget: number;
    remainingCredits: number;
    requestId: string;
    meetingId?: string;
    allowSearch: boolean;
  },
  generate: (allowSearch: boolean) => Promise<Answer>
): Promise<Answer> {
  const base = await calculateAiStudioUsageCost({
    workspaceId: input.workspaceId,
    modelId: input.model.id,
    inputTokens: input.inputBudget,
    outputTokens: input.maxOutputTokens,
    reasoningTokens: input.maxOutputTokens,
  });
  let reservedCredits = base.billedCredits;
  let allowSearch = false;
  if (input.allowSearch && MEETING_APP !== 'parley') {
    // publicMeetSearch permits one provider attempt per answer.
    const search = await calculateAiStudioUsageCost({
      workspaceId: input.workspaceId,
      modelId: input.model.id,
      searchCount: input.model.providerModelId.startsWith('gemini-2.5')
        ? 1
        : 10,
    });
    if (reservedCredits + search.billedCredits <= input.remainingCredits) {
      reservedCredits += search.billedCredits;
      allowSearch = true;
    }
  }
  const metadata = {
    app: MEETING_APP,
    source: `${MEETING_APP}_mira${input.meetingId ? '' : '_personal'}`,
    ...(input.meetingId ? { meetingId: input.meetingId } : {}),
  };
  const run = await beginAiStudioRun({
    actorId: input.userId,
    workspaceId: input.workspaceId,
    modelId: input.model.id,
    feature: 'chat',
    requestId: input.requestId,
    idempotencyKey: input.requestId,
    rejectExisting: true,
    reservedCredits: Math.max(1, Math.ceil(reservedCredits)),
    metadata,
  });
  const started = Date.now();
  let answer: Answer;
  try {
    answer = await generate(allowSearch);
  } catch (error) {
    await settleAiStudioRun({
      runId: run.runId,
      status: 'failed',
      actualCredits: 0,
      errorClass: 'provider_failed',
      metadata: { ...metadata, usage_source: 'unavailable' },
    });
    throw error;
  }
  if (!answer.usage.available)
    throw new MeetCallAccessError(503, 'AI usage accounting is unavailable');
  const actual = await calculateAiStudioUsageCost({
    workspaceId: input.workspaceId,
    modelId: input.model.id,
    inputTokens: answer.usage.inputTokens,
    outputTokens: answer.usage.outputTokens,
    searchCount: answer.searchCount,
  });
  await Effect.runPromise(
    Effect.retry(
      Effect.tryPromise(() =>
        settleAiStudioRun({
          runId: run.runId,
          status: 'succeeded',
          actualCredits: actual.billedCredits,
          providerCostUsd: actual.providerCostUsd,
          inputTokens: answer.usage.inputTokens,
          outputTokens: answer.usage.outputTokens,
          latencyMs: Date.now() - started,
          metadata: {
            ...metadata,
            usage_source: 'provider',
            search_count: answer.searchCount,
          },
        })
      ),
      { times: 2 }
    )
  ).catch(() => {
    throw new MeetCallAccessError(503, 'AI quota accounting failed');
  });
  await recordAiStudioRunStep({
    runId: run.runId,
    sequence: 0,
    kind: 'model',
    name: 'meeting_chat',
    status: 'succeeded',
    modelId: input.model.id,
    billedCredits: actual.billedCredits,
    providerCostUsd: actual.providerCostUsd,
    inputTokens: answer.usage.inputTokens,
    outputTokens: answer.usage.outputTokens,
    latencyMs: Date.now() - started,
    metadata: { app: MEETING_APP, usage_source: 'provider' },
  }).catch(() => {
    console.warn('Meeting AI run step recording pending', { runId: run.runId });
  });
  return answer;
}
