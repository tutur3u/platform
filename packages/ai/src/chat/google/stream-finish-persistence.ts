import { randomUUID } from 'node:crypto';
import { deductAiCredits } from '@tuturuuu/ai/credits/check-credits';
import type { CreditDeductionResult } from '../../credits/types';

type UsageLike = {
  inputTokens?: number;
  inputTokenDetails?: {
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    cachedTokens?: number;
    noCacheTokens?: number;
  };
  outputTokens?: number;
  outputTokenDetails?: {
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    cachedTokens?: number;
    noCacheTokens?: number;
    reasoningTokens?: number;
    textTokens?: number;
  };
  reasoningTokens?: number;
};

type GroundingMetadataLike = {
  webSearchQueries?: string[];
};

type GoogleProviderMetadataLike = {
  groundingMetadata?: GroundingMetadataLike;
};

type ProviderMetadataLike = {
  google?: GoogleProviderMetadataLike;
};

type ToolCallLike = {
  toolCallId?: string;
  toolName?: string;
} & Record<string, unknown>;

type ToolResultLike = {
  toolCallId?: string;
  toolName?: string;
} & Record<string, unknown>;

type SourceLike = {
  sourceId?: string;
  url?: string;
  title?: string;
};

type StepLike = {
  toolCalls?: ToolCallLike[];
  toolResults?: ToolResultLike[];
  usage?: UsageLike;
  providerMetadata?: ProviderMetadataLike;
  sources?: unknown[];
  reasoningText?: string;
};

type StreamFinishResponseLike = {
  text?: string;
  finishReason?: string;
  usage?: UsageLike;
  totalUsage?: UsageLike;
  steps?: StepLike[];
  providerMetadata?: ProviderMetadataLike;
  reasoningText?: string;
  sources?: SourceLike[];
};

type UsageTotals = {
  cachedInputTokens: number;
  cachedOutputTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

type InsertedMessage = {
  id?: string;
};

type InsertResult = PromiseLike<{
  data: InsertedMessage | null;
  error: { message: string } | null;
}>;

type AdminClientLike = {
  from: (table: 'ai_chat_messages') => {
    insert: (payload: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => InsertResult;
      };
    };
  };
};

type PersistAssistantResponseParams = {
  response: StreamFinishResponseLike;
  sbAdmin: AdminClientLike;
  chatId: string;
  userId: string;
  model: string;
  effectiveSource: 'Mira' | 'Rewise';
  observabilityContext?: unknown;
  wsId?: string;
};

function collectToolData(steps: StepLike[]) {
  const allToolCalls = steps.flatMap((step) => step.toolCalls ?? []);
  const allToolResults = steps.flatMap((step) => step.toolResults ?? []);
  return { allToolCalls, allToolResults };
}

function collectReasoningText(response: StreamFinishResponseLike): string {
  const allReasoning = (response.steps ?? [])
    .map((step) => step.reasoningText)
    .filter(Boolean)
    .join('\n\n');

  return allReasoning || response.reasoningText || '';
}

function collectUsageTotals(response: StreamFinishResponseLike): UsageTotals {
  const usage = response.totalUsage ?? response.usage ?? {};
  let cachedInputTokens = getCachedTokenCount(usage.inputTokenDetails);
  let cachedOutputTokens = getCachedTokenCount(usage.outputTokenDetails);
  let inputTokens = usage.inputTokens ?? 0;
  let outputTokens = usage.outputTokens ?? 0;
  let reasoningTokens = usage.reasoningTokens ?? 0;

  if ((response.steps?.length ?? 0) > 0) {
    let stepInputSum = 0;
    let stepOutputSum = 0;
    let stepReasoningSum = 0;
    let stepCachedInputSum = 0;
    let stepCachedOutputSum = 0;

    for (const step of response.steps ?? []) {
      const stepUsage = step.usage;
      if (!stepUsage) continue;

      stepInputSum += stepUsage.inputTokens ?? 0;
      stepOutputSum += stepUsage.outputTokens ?? 0;
      stepReasoningSum += stepUsage.reasoningTokens ?? 0;
      stepCachedInputSum += getCachedTokenCount(stepUsage.inputTokenDetails);
      stepCachedOutputSum += getCachedTokenCount(stepUsage.outputTokenDetails);
    }

    if (inputTokens === 0) {
      inputTokens = stepInputSum;
    }
    if (outputTokens === 0) {
      outputTokens = stepOutputSum;
    }
    if (reasoningTokens === 0) {
      reasoningTokens = stepReasoningSum;
    }
    if (cachedInputTokens === 0) {
      cachedInputTokens = stepCachedInputSum;
    }
    if (cachedOutputTokens === 0) {
      cachedOutputTokens = stepCachedOutputSum;
    }
  }

  return {
    cachedInputTokens,
    cachedOutputTokens,
    inputTokens,
    outputTokens,
    reasoningTokens,
  };
}

function getCachedTokenCount(
  details: UsageLike['inputTokenDetails'] | UsageLike['outputTokenDetails']
) {
  if (!details) return 0;
  return (
    details.cachedTokens ??
    (details.cacheReadTokens ?? 0) + (details.cacheWriteTokens ?? 0)
  );
}

function collectSerializableSources(response: StreamFinishResponseLike) {
  if (!response.sources?.length) return [];

  return response.sources.map((source) => ({
    sourceId: source.sourceId,
    url: source.url,
    title: source.title,
  }));
}

function logGoogleSearchDebug(response: StreamFinishResponseLike): void {
  if (process.env.GOOGLE_SEARCH_DEBUG !== 'true') {
    return;
  }

  console.log('[Google Search Debug] response keys:', Object.keys(response));
  console.log(
    '[Google Search Debug] providerMetadata:',
    JSON.stringify(response.providerMetadata, null, 2)?.slice(0, 500)
  );
  console.log(
    '[Google Search Debug] sources:',
    JSON.stringify(response.sources, null, 2)?.slice(0, 500)
  );

  if (!response.steps?.length) return;

  for (let stepIndex = 0; stepIndex < response.steps.length; stepIndex++) {
    const step = response.steps[stepIndex];
    console.log(
      `[Google Search Debug] step[${stepIndex}] providerMetadata:`,
      JSON.stringify(step?.providerMetadata, null, 2)?.slice(0, 500)
    );
    console.log(
      `[Google Search Debug] step[${stepIndex}] sources:`,
      JSON.stringify(step?.sources, null, 2)?.slice(0, 500)
    );
  }
}

function countGoogleSearchQueries(
  response: StreamFinishResponseLike,
  allToolCalls: ToolCallLike[]
): number {
  const customGoogleSearchCalls = allToolCalls.filter(
    (toolCall) => toolCall.toolName === 'google_search'
  ).length;
  if (customGoogleSearchCalls > 0) return customGoogleSearchCalls;

  const topQueries =
    response.providerMetadata?.google?.groundingMetadata?.webSearchQueries;
  if (topQueries?.length) return topQueries.length;

  let perStepQueriesCount = 0;
  for (const step of response.steps ?? []) {
    const stepQueries =
      step.providerMetadata?.google?.groundingMetadata?.webSearchQueries;
    if (stepQueries?.length) {
      perStepQueriesCount += stepQueries.length;
    }
  }
  if (perStepQueriesCount > 0) return perStepQueriesCount;

  if (Array.isArray(response.sources) && response.sources.length > 0) {
    return 1;
  }

  return 0;
}

function collectUiMessageParts({
  allToolCalls,
  allToolResults,
  reasoningText,
  response,
  serializedSources,
}: {
  allToolCalls: ToolCallLike[];
  allToolResults: ToolResultLike[];
  reasoningText: string;
  response: StreamFinishResponseLike;
  serializedSources: ReturnType<typeof collectSerializableSources>;
}) {
  const parts: Record<string, unknown>[] = [];

  if (response.text) {
    parts.push({ type: 'text', text: response.text });
  }

  if (reasoningText) {
    parts.push({ type: 'reasoning', text: reasoningText });
  }

  for (const toolCall of allToolCalls) {
    const toolCallId =
      toolCall.toolCallId ?? readString(toolCall.toolCallId) ?? undefined;
    const matchingResult = allToolResults.find(
      (result) => toolCallId && readString(result.toolCallId) === toolCallId
    );
    parts.push({
      type: 'dynamic-tool',
      toolName: toolCall.toolName ?? matchingResult?.toolName ?? 'tool',
      toolCallId: toolCallId ?? randomUUID(),
      state: matchingResult ? 'output-available' : 'input-available',
      input: extractToolInput(toolCall),
      ...(matchingResult ? { output: extractToolOutput(matchingResult) } : {}),
    });
  }

  for (const toolResult of allToolResults) {
    const hasCall = allToolCalls.some(
      (toolCall) =>
        readString(toolCall.toolCallId) &&
        readString(toolCall.toolCallId) === readString(toolResult.toolCallId)
    );
    if (hasCall) continue;

    parts.push({
      type: 'dynamic-tool',
      toolName: toolResult.toolName ?? 'tool',
      toolCallId: toolResult.toolCallId ?? randomUUID(),
      state: 'output-available',
      output: extractToolOutput(toolResult),
    });
  }

  for (const source of serializedSources) {
    if (!source.url) continue;
    parts.push({
      type: 'source-url',
      sourceId: source.sourceId ?? source.url,
      title: source.title,
      url: source.url,
    });
  }

  return parts;
}

function extractToolInput(toolCall: ToolCallLike) {
  return toolCall.input ?? toolCall.args ?? toolCall.arguments ?? {};
}

function extractToolOutput(toolResult: ToolResultLike) {
  return toolResult.output ?? toolResult.result ?? toolResult;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function persistAssistantResponse({
  response,
  sbAdmin,
  chatId,
  userId,
  model,
  effectiveSource,
  observabilityContext,
  wsId,
}: PersistAssistantResponseParams): Promise<void> {
  const steps = response.steps ?? [];
  const { allToolCalls, allToolResults } = collectToolData(steps);

  if (
    !response.text &&
    allToolCalls.length === 0 &&
    allToolResults.length === 0
  ) {
    console.warn('onFinish: no text and no tool calls — skipping DB save');
    return;
  }

  const reasoningText = collectReasoningText(response);
  const {
    cachedInputTokens,
    cachedOutputTokens,
    inputTokens,
    outputTokens,
    reasoningTokens,
  } = collectUsageTotals(response);
  const serializedSources = collectSerializableSources(response);
  const parts = collectUiMessageParts({
    allToolCalls,
    allToolResults,
    reasoningText,
    response,
    serializedSources,
  });

  const { data: messageData, error } = await sbAdmin
    .from('ai_chat_messages')
    .insert({
      chat_id: chatId,
      creator_id: userId,
      content: response.text || '',
      role: 'ASSISTANT',
      model: (model.includes('/')
        ? model.split('/').pop()!
        : model
      ).toLowerCase(),
      finish_reason: response.finishReason,
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      metadata: {
        source: effectiveSource,
        ai: {
          finishReason: response.finishReason,
          model,
          observability: {
            contextBreakdown: observabilityContext ?? [],
          },
          parts,
          usage: {
            cachedInputTokens,
            cachedOutputTokens,
            inputTokens,
            outputTokens,
            reasoningTokens,
          },
        },
        ...(reasoningText ? { reasoning: reasoningText } : {}),
        ...(allToolCalls.length
          ? { toolCalls: structuredClone(allToolCalls) }
          : {}),
        ...(allToolResults.length
          ? { toolResults: structuredClone(allToolResults) }
          : {}),
        ...(serializedSources.length ? { sources: serializedSources } : {}),
      },
    })
    .select('id')
    .single();

  if (error) {
    console.log('ERROR ORIGIN: ROOT COMPLETION');
    console.log(error);
    throw new Error(error.message);
  }

  console.log('AI Response saved to database');
  logGoogleSearchDebug(response);

  const searchCount = countGoogleSearchQueries(response, allToolCalls);
  if (searchCount > 0) {
    console.log(
      `Google Search grounding detected: ${searchCount} search quer${searchCount === 1 ? 'y' : 'ies'}`
    );
  }

  if (
    (wsId || userId) &&
    (inputTokens > 0 ||
      outputTokens > 0 ||
      reasoningTokens > 0 ||
      searchCount > 0)
  ) {
    let deductionResult: CreditDeductionResult;
    try {
      deductionResult = await deductAiCredits({
        wsId: wsId ?? undefined,
        userId,
        modelId: model,
        inputTokens,
        outputTokens,
        reasoningTokens,
        feature: 'chat',
        chatMessageId: messageData?.id,
        ...(searchCount > 0 ? { searchCount } : {}),
      });
    } catch (error) {
      console.error('Failed to deduct AI credits after assistant response.', {
        wsId,
        userId,
        chatMessageId: messageData?.id,
        model,
        ...(searchCount > 0 ? { searchCount } : {}),
        error,
      });
      return;
    }

    if (!deductionResult.success) {
      console.error('AI credit deduction returned unsuccessful result.', {
        wsId,
        userId,
        chatMessageId: messageData?.id,
        model,
        ...(searchCount > 0 ? { searchCount } : {}),
        deductionResult,
      });
      return;
    }

    console.info('AI credits deducted for assistant response.', {
      wsId,
      userId,
      chatMessageId: messageData?.id,
      model,
      ...(searchCount > 0 ? { searchCount } : {}),
      deductionResult,
    });
  }
}
