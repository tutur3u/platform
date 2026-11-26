import { google } from '@ai-sdk/google';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { generateText, stepCountIs } from 'ai';
import { z } from 'zod';
import { countGoogleSearchQueries } from '../../chat/google/google-search-usage';
import { toBareModelName } from '../../credits/model-mapping';
import { reserveNestedModelBudget } from '../../credits/nested-budget';
import {
  PlanModelResolutionError,
  resolvePlanModel,
} from '../../credits/resolve-plan-model';
import { normalizeAiTokenUsage } from '../../credits/token-usage';
import { withAiMemory } from '../../memory';
import { isGoogleSearchToolName } from '../google-search-events';
import { createGoogleSearchToolSet } from '../google-search-tool';
import type { MiraToolContext } from '../mira-tools';

const SEARCH_WRAPPER_MODEL = 'gemini-3.5-flash-lite';
const SEARCH_MAX_OUTPUT_TOKENS = 2048;
const SEARCH_TOKEN_RESERVE_CREDITS = 20;
const SEARCH_MAX_ATTEMPTS = 2;
const SEARCH_ESTIMATED_QUERIES_GEMINI_3 = 4;

function estimateGroundedSearchQueries(modelId: string): number {
  // Gemini 1.x/2.x bill one search unit per grounded prompt, and the retry
  // runs only when the first attempt issued zero grounded queries. Gemini 3.x
  // bills per distinct webSearchQueries entry without a provider query cap, so
  // reserve conservatively for multiple queries on a single grounded call.
  return /(?:^|\/)gemini-[12](?:[.-]|$)/.test(modelId)
    ? 1
    : SEARCH_ESTIMATED_QUERIES_GEMINI_3;
}

type SearchSource = {
  sourceId?: string;
  title?: string;
  url?: string;
};

type ToolStepLike = {
  toolCalls?: Array<{ toolName?: string }>;
  toolResults?: Array<{ toolName?: string }>;
};

const SearchArgsSchema = z.object({
  query: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, {
      message: 'Missing required `query`.',
    })
    .transform((value) => value.slice(0, 500)),
});

function hasGoogleSearchCallInSteps(steps: unknown): boolean {
  if (!Array.isArray(steps)) return false;

  return steps.some((step) => {
    if (!step || typeof step !== 'object') return false;
    const typedStep = step as ToolStepLike;
    const called = (typedStep.toolCalls ?? []).some((toolCall) =>
      isGoogleSearchToolName(toolCall.toolName)
    );
    const hasResult = (typedStep.toolResults ?? []).some((toolResult) =>
      isGoogleSearchToolName(toolResult.toolName)
    );
    return called || hasResult;
  });
}

function hasGroundingQueries(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const result = value as {
    providerMetadata?: {
      google?: { groundingMetadata?: { webSearchQueries?: unknown } };
    };
    steps?: unknown[];
  };
  const queries =
    result.providerMetadata?.google?.groundingMetadata?.webSearchQueries;
  return (
    (Array.isArray(queries) &&
      queries.some(
        (query) => typeof query === 'string' && query.trim().length > 0
      )) ||
    (result.steps?.some(hasGroundingQueries) ?? false)
  );
}

function normalizeSources(value: unknown): SearchSource[] {
  if (!Array.isArray(value)) return [];

  const normalized: SearchSource[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;

    const source = item as Record<string, unknown>;
    const sourceId =
      typeof source.sourceId === 'string' ? source.sourceId : undefined;
    const title = typeof source.title === 'string' ? source.title : undefined;
    const url = typeof source.url === 'string' ? source.url : undefined;

    if (!sourceId && !title && !url) continue;

    normalized.push({ sourceId, title, url });
  }

  return normalized;
}

async function runGoogleSearchWrapper(
  query: string,
  forceTool: boolean,
  ctx: MiraToolContext,
  modelId: string,
  maxOutputTokens: number
) {
  const prompt = forceTool
    ? `You must call the google_search tool before producing the final answer.\nUse a single focused web search query for the question below and provide an accurate, concise answer with key points and cited sources.\n\nQuery: ${query}`
    : `Use a single focused web search query for the question below and provide an accurate, concise answer with key points and cited sources.\n\nQuery: ${query}`;

  return generateText({
    model: await withAiMemory({
      addMemory: 'never',
      customId: ctx.chatId ? `${ctx.chatId}-google-search` : query,
      model: google(toBareModelName(modelId)),
      product: 'mira',
      source: 'mira_google_search_tool',
      surface: 'mira_google_search_tool',
      userId: ctx.userId,
      wsId: ctx.workspaceContext?.wsId ?? ctx.wsId,
    }),
    tools: createGoogleSearchToolSet(),
    prompt,
    stopWhen: stepCountIs(1),
    maxRetries: 0,
    maxOutputTokens,
    abortSignal: AbortSignal.timeout(30_000),
    toolChoice: 'auto',
  });
}

function accumulateSearchUsage(
  target: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
  },
  result: unknown
) {
  const typed = result as { totalUsage?: unknown; usage?: unknown } | null;
  const rawUsage = typed?.totalUsage ?? typed?.usage;
  if (!rawUsage || typeof rawUsage !== 'object') return;
  const normalized = normalizeAiTokenUsage(
    rawUsage as Parameters<typeof normalizeAiTokenUsage>[0]
  );
  target.inputTokens += normalized.inputTokens;
  target.outputTokens += normalized.outputTokens;
  target.reasoningTokens += normalized.reasoningTokens;
}

export async function executeGoogleSearch(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const parsed = SearchArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid `query`.',
    };
  }

  const { query } = parsed.data;
  const billingWsId = ctx.creditWsId ?? ctx.wsId;

  let modelId: string;
  try {
    const resolvedModel = await resolvePlanModel({
      capability: 'language',
      requestedModel: SEARCH_WRAPPER_MODEL,
      wsId: billingWsId,
    });
    modelId = resolvedModel.modelId;
  } catch (error) {
    if (error instanceof PlanModelResolutionError) {
      return {
        ok: false,
        query,
        error: 'Web search is not available on your current plan.',
      };
    }
    throw error;
  }

  const sbAdmin = await createAdminClient();
  const budget = await reserveNestedModelBudget({
    sbAdmin,
    wsId: billingWsId,
    userId: ctx.userId,
    modelId,
    feature: 'chat',
    estimatedInputTokens: Math.max(64, Math.ceil((query.length + 220) / 3)),
    attemptCount: SEARCH_MAX_ATTEMPTS,
    estimatedSearchCount: estimateGroundedSearchQueries(modelId),
    maxReserveCredits: SEARCH_TOKEN_RESERVE_CREDITS,
    maxOutputTokensLimit: SEARCH_MAX_OUTPUT_TOKENS,
    metadata: {
      source: 'mira_google_search_tool',
      ...(ctx.chatId ? { chatId: ctx.chatId } : {}),
    },
  });

  if (!budget.ok) {
    return {
      ok: false,
      query,
      error:
        budget.code === 'CREDIT_CHECK_FAILED'
          ? 'AI request budget could not be verified for web search.'
          : 'AI credits are insufficient for web search.',
    };
  }

  const usageTotals = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  let searchInvocations = 0;

  try {
    let result = await runGoogleSearchWrapper(
      query,
      false,
      ctx,
      modelId,
      budget.perAttemptMaxOutputTokens
    );
    accumulateSearchUsage(usageTotals, result);
    let sources = normalizeSources((result as { sources?: unknown }).sources);
    let wasToolCalled = hasGoogleSearchCallInSteps(
      (result as { steps?: unknown }).steps
    );
    const firstQueryCount = countGoogleSearchQueries(
      modelId,
      result as never,
      []
    );
    const firstAttemptSearchUnits =
      firstQueryCount > 0
        ? firstQueryCount
        : wasToolCalled || hasGroundingQueries(result)
          ? 1
          : 0;
    searchInvocations += firstAttemptSearchUnits;

    if (
      firstAttemptSearchUnits === 0 &&
      !wasToolCalled &&
      !hasGroundingQueries(result)
    ) {
      result = await runGoogleSearchWrapper(
        query,
        true,
        ctx,
        modelId,
        budget.perAttemptMaxOutputTokens
      );
      accumulateSearchUsage(usageTotals, result);
      sources = normalizeSources((result as { sources?: unknown }).sources);
      wasToolCalled = hasGoogleSearchCallInSteps(
        (result as { steps?: unknown }).steps
      );
      const retryQueryCount = countGoogleSearchQueries(
        modelId,
        result as never,
        []
      );
      searchInvocations +=
        retryQueryCount > 0
          ? retryQueryCount
          : wasToolCalled || hasGroundingQueries(result)
            ? 1
            : 0;
    }

    await budget.settle({
      ...usageTotals,
      searchCount: searchInvocations,
    });

    if (!wasToolCalled && !hasGroundingQueries(result)) {
      return {
        ok: false,
        query,
        error: 'Failed to invoke google_search tool for web-grounded results.',
      };
    }

    if (!result.text.trim())
      return {
        ok: false,
        query,
        error:
          'Search completed without a final answer. Try a more specific query.',
      };

    return {
      ok: true,
      query,
      answer: result.text,
      sources,
      sourceCount: sources.length,
    };
  } catch (error) {
    await budget
      .settle({
        ...usageTotals,
        searchCount: searchInvocations,
      })
      .catch(() => undefined);
    console.error('executeGoogleSearch provider error:', error);
    return {
      ok: false,
      query,
      error: 'Search provider error. Please try again.',
    };
  }
}
