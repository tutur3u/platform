import { deductAiCredits } from '@tuturuuu/ai/credits/check-credits';
import type { CreditDeductionResult } from '../../credits/types';
import { MIRA_VISUAL_TOOL_NAMES } from '../../tools/mira-tool-names';

type UsageLike = {
  inputTokens?: number;
  outputTokens?: number;
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
  toolName?: string;
} & Record<string, unknown>;

type ToolResultLike = Record<string, unknown>;

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
  wsId?: string;
};

const VISUAL_TOOL_NAMES = new Set<string>(MIRA_VISUAL_TOOL_NAMES);
const INTERNAL_TOOL_NAMES = new Set(['select_tools', 'no_action_needed']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasFailureFlag(value: unknown, seen = new WeakSet<object>()): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasFailureFlag(item, seen));
  }

  if (!isRecord(value)) return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (value.ok === false || value.success === false) {
    return true;
  }

  return Object.values(value).some((entry) => hasFailureFlag(entry, seen));
}

function hasToolFailures(allToolResults: ToolResultLike[]): boolean {
  if (allToolResults.length === 0) return true;
  return allToolResults.some((toolResult) => hasFailureFlag(toolResult));
}

function humanizeToolName(toolName: string): string {
  return toolName.replaceAll('_', ' ');
}

function getToolNameFromResult(toolResult: ToolResultLike): string | null {
  const toolName = toolResult.toolName;
  return typeof toolName === 'string' ? toolName : null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function buildToolOutcomeSummary(allToolResults: ToolResultLike[]): string {
  const createdTasks: string[] = [];
  let updatedTaskCount = 0;
  let completedTaskCount = 0;
  let deletedTaskCount = 0;

  for (const toolResult of allToolResults) {
    const toolName = getToolNameFromResult(toolResult);
    const output = getRecord(toolResult.output);
    if (!toolName || !output || output.success === false || output.ok === false)
      continue;

    if (toolName === 'create_task') {
      const task = getRecord(output.task);
      const taskName = getString(task?.name);
      if (taskName) createdTasks.push(taskName);
      continue;
    }

    if (toolName === 'update_task') {
      updatedTaskCount += 1;
      continue;
    }

    if (toolName === 'complete_task') {
      completedTaskCount += 1;
      continue;
    }

    if (toolName === 'delete_task') {
      deletedTaskCount += 1;
    }
  }

  const lines: string[] = [];

  if (createdTasks.length > 0) {
    lines.push(
      createdTasks.length === 1
        ? `I created 1 task: ${createdTasks[0]}.`
        : `I created ${createdTasks.length} tasks: ${createdTasks.join(', ')}.`
    );
  }

  if (updatedTaskCount > 0) {
    lines.push(
      updatedTaskCount === 1
        ? 'I also updated 1 task.'
        : `I also updated ${updatedTaskCount} tasks.`
    );
  }

  if (completedTaskCount > 0) {
    lines.push(
      completedTaskCount === 1
        ? 'I marked 1 task as complete.'
        : `I marked ${completedTaskCount} tasks as complete.`
    );
  }

  if (deletedTaskCount > 0) {
    lines.push(
      deletedTaskCount === 1
        ? 'I deleted 1 task.'
        : `I deleted ${deletedTaskCount} tasks.`
    );
  }

  return lines.join('\n');
}

function buildSuccessfulToolSummary(allToolCalls: ToolCallLike[]): string {
  const calledToolNames = allToolCalls
    .map((toolCall) => toolCall.toolName)
    .filter(
      (toolName): toolName is string =>
        typeof toolName === 'string' && !INTERNAL_TOOL_NAMES.has(toolName)
    );

  if (calledToolNames.length === 0) {
    return '';
  }

  const counts = new Map<string, number>();
  for (const toolName of calledToolNames) {
    counts.set(toolName, (counts.get(toolName) ?? 0) + 1);
  }

  return [
    'I completed the requested actions successfully.',
    '',
    'Actions completed:',
    ...[...counts.entries()].map(([toolName, count]) =>
      count > 1
        ? `- ${humanizeToolName(toolName)} (${count} times)`
        : `- ${humanizeToolName(toolName)}`
    ),
  ].join('\n');
}

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
  let inputTokens = usage.inputTokens ?? 0;
  let outputTokens = usage.outputTokens ?? 0;
  let reasoningTokens = usage.reasoningTokens ?? 0;

  if ((response.steps?.length ?? 0) > 0) {
    let stepInputSum = 0;
    let stepOutputSum = 0;
    let stepReasoningSum = 0;

    for (const step of response.steps ?? []) {
      const stepUsage = step.usage;
      if (!stepUsage) continue;

      stepInputSum += stepUsage.inputTokens ?? 0;
      stepOutputSum += stepUsage.outputTokens ?? 0;
      stepReasoningSum += stepUsage.reasoningTokens ?? 0;
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
  }

  return { inputTokens, outputTokens, reasoningTokens };
}

function collectSerializableSources(response: StreamFinishResponseLike) {
  if (!response.sources?.length) return [];

  return response.sources.map((source) => ({
    sourceId: source.sourceId,
    url: source.url,
    title: source.title,
  }));
}

function buildFallbackAssistantText(
  response: StreamFinishResponseLike,
  allToolCalls: ToolCallLike[],
  allToolResults: ToolResultLike[]
): string {
  const calledToolNames = allToolCalls
    .map((toolCall) => toolCall.toolName)
    .filter((toolName): toolName is string => typeof toolName === 'string');

  if (calledToolNames.some((toolName) => VISUAL_TOOL_NAMES.has(toolName))) {
    return '';
  }

  if (
    calledToolNames.length > 0 &&
    calledToolNames.every((toolName) => toolName === 'recall')
  ) {
    return "I checked the saved context for this turn, but I didn't finish a visible reply. Please try again.";
  }

  if (calledToolNames.length > 0 && !hasToolFailures(allToolResults)) {
    const concreteOutcomeSummary = buildToolOutcomeSummary(allToolResults);
    if (concreteOutcomeSummary) {
      return concreteOutcomeSummary;
    }

    const successfulToolSummary = buildSuccessfulToolSummary(allToolCalls);
    if (successfulToolSummary) {
      return successfulToolSummary;
    }
  }

  if (calledToolNames.length > 0) {
    return "I finished some background steps for this turn, but I didn't produce a visible reply. Please try again.";
  }

  if (response.finishReason === 'length') {
    return 'I ran out of room before I could finish the reply. Please try again.';
  }

  return "I didn't produce a visible reply for this turn. Please try again.";
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

export async function persistAssistantResponse({
  response,
  sbAdmin,
  chatId,
  userId,
  model,
  effectiveSource,
  wsId,
}: PersistAssistantResponseParams): Promise<void> {
  const steps = response.steps ?? [];
  const { allToolCalls, allToolResults } = collectToolData(steps);
  const persistedText =
    response.text?.trim() ||
    buildFallbackAssistantText(response, allToolCalls, allToolResults);

  if (
    !persistedText &&
    allToolCalls.length === 0 &&
    allToolResults.length === 0
  ) {
    console.warn('onFinish: no text and no tool calls — skipping DB save');
    return;
  }

  const reasoningText = collectReasoningText(response);
  const { inputTokens, outputTokens, reasoningTokens } =
    collectUsageTotals(response);
  const serializedSources = collectSerializableSources(response);

  const { data: messageData, error } = await sbAdmin
    .from('ai_chat_messages')
    .insert({
      chat_id: chatId,
      content: persistedText,
      creator_id: userId,
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
