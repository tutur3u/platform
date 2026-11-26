import { google } from '@ai-sdk/google';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  gateway,
  type LanguageModelUsage,
  stepCountIs,
  ToolLoopAgent,
} from 'ai';
import { z } from 'zod';
import {
  GEMINI_31_FLASH_LITE_MODEL,
  isGoogleModelId,
  toBareModelName,
} from '../../credits/model-mapping';
import {
  type NestedBudgetDenialCode,
  reserveNestedModelBudget,
} from '../../credits/nested-budget';
import {
  PlanModelResolutionError,
  resolvePlanModel,
} from '../../credits/resolve-plan-model';
import { withAiMemory } from '../../memory';
import type { MiraToolContext } from '../mira-tools';

const PARALLEL_CHECKS_MODEL = GEMINI_31_FLASH_LITE_MODEL;
const PARALLEL_CHECKS_RESERVATION_PER_CHECK = 5;
const PARALLEL_CHECKS_MAX_OUTPUT_PER_CHECK = 600;

const ParallelChecksArgsSchema = z.object({
  question: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, {
      message: 'Missing required `question`.',
    })
    .transform((value) => value.slice(0, 2000)),
  context: z
    .string()
    .transform((value) => value.trim())
    .optional()
    .transform((value) => (value ? value.slice(0, 8000) : undefined)),
  checks: z
    .array(z.enum(['assumptions', 'factuality', 'risk', 'implementation']))
    .min(1)
    .max(4)
    .optional(),
});

type CheckKind = z.infer<typeof ParallelChecksArgsSchema>['checks'] extends
  | Array<infer T>
  | undefined
  ? T
  : never;

type MeteredUsage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

const DEFAULT_CHECKS: CheckKind[] = ['assumptions', 'factuality', 'risk'];

const PARALLEL_DENIAL_MESSAGES: Record<NestedBudgetDenialCode, string> = {
  ACCESS_DENIED:
    'Parallel checks are not available. Please check your AI credit settings.',
  CREDIT_CHECK_FAILED:
    'AI request budget could not be verified for parallel checks.',
  CREDITS_EXHAUSTED: 'You have run out of AI credits for parallel checks.',
  DAILY_LIMIT_REACHED: 'Daily AI credit limit reached for parallel checks.',
  FEATURE_NOT_ALLOWED:
    'Parallel checks are not available on your current plan.',
  MODEL_NOT_ALLOWED:
    'The parallel-checks model is not enabled for your workspace.',
  NO_ALLOCATION: 'AI credits are not configured for your workspace.',
};

function buildPrompt({
  check,
  context,
  question,
}: {
  check: CheckKind;
  context?: string;
  question: string;
}) {
  return `Review this request from the "${check}" perspective.

Question or scenario:
${question}

${context ? `Relevant context:\n${context}\n\n` : ''}Return:
- 1 to 3 concise findings
- Any blocker, if present
- "No material issues" if this perspective has nothing important`;
}

function normalizeTokenCount(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function extractMeteredUsage(usage: LanguageModelUsage): MeteredUsage {
  return {
    inputTokens: normalizeTokenCount(usage.inputTokens),
    outputTokens: normalizeTokenCount(usage.outputTokens),
    reasoningTokens: normalizeTokenCount(
      usage.outputTokenDetails?.reasoningTokens
    ),
  };
}

async function runCheck({
  abortSignal,
  check,
  context,
  maxOutputTokens,
  modelId,
  question,
  toolContext,
}: {
  abortSignal?: AbortSignal;
  check: CheckKind;
  context?: string;
  maxOutputTokens: number;
  modelId: string;
  question: string;
  toolContext: MiraToolContext;
}) {
  const baseModel = isGoogleModelId(modelId)
    ? google(toBareModelName(modelId))
    : gateway(modelId);
  const model = await withAiMemory({
    addMemory: 'never',
    customId: toolContext.chatId
      ? `${toolContext.chatId}-parallel-check-${check}`
      : `parallel-check-${check}`,
    model: baseModel,
    product: 'mira',
    source: 'mira_parallel_checks_tool',
    surface: 'mira_parallel_checks_tool',
    userId: toolContext.userId,
    wsId: toolContext.workspaceContext?.wsId ?? toolContext.wsId,
  });

  const agent = new ToolLoopAgent({
    instructions:
      'You are a concise verification subagent. Return short, factual, high-signal notes only. Do not invent facts or tool outputs.',
    maxOutputTokens,
    maxRetries: 0,
    model,
    stopWhen: stepCountIs(2),
    temperature: 0.2,
  });

  const result = await agent.generate({
    abortSignal,
    prompt: buildPrompt({ check, context, question }),
  });

  const usage = extractMeteredUsage(result.totalUsage ?? result.usage);

  return {
    label: check,
    finding: result.text.trim() || 'No material issues.',
    usage,
  };
}

export async function executeParallelChecks(
  args: Record<string, unknown>,
  ctx: MiraToolContext,
  options?: { abortSignal?: AbortSignal }
) {
  const parsed = ParallelChecksArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid parallel check input.',
    };
  }

  const { context, question } = parsed.data;
  const checks = parsed.data.checks ?? DEFAULT_CHECKS;
  const billingWsId = ctx.creditWsId ?? ctx.wsId;

  let modelId: string;
  try {
    const resolvedModel = await resolvePlanModel({
      capability: 'language',
      requestedModel: PARALLEL_CHECKS_MODEL,
      wsId: billingWsId,
    });
    modelId = resolvedModel.modelId;
  } catch (error) {
    if (error instanceof PlanModelResolutionError) {
      return {
        ok: false,
        error: 'Parallel checks are not available on your current plan.',
      };
    }
    return {
      ok: false,
      error: 'Parallel checks failed. Please try again.',
    };
  }

  const sbAdmin = await createAdminClient();
  const samplePrompt = buildPrompt({
    check: checks[0] ?? 'assumptions',
    context,
    question,
  });
  const budget = await reserveNestedModelBudget({
    sbAdmin,
    wsId: billingWsId,
    userId: ctx.userId,
    modelId,
    feature: 'chat',
    estimatedInputTokens: Math.max(
      64,
      Math.ceil((samplePrompt.length + 180) / 3)
    ),
    attemptCount: checks.length,
    maxReserveCredits: checks.length * PARALLEL_CHECKS_RESERVATION_PER_CHECK,
    maxOutputTokensLimit: PARALLEL_CHECKS_MAX_OUTPUT_PER_CHECK,
    metadata: {
      source: 'mira_parallel_checks_tool',
      creditWsId: billingWsId,
      routeWsId: ctx.wsId,
      ...(ctx.chatId ? { chatId: ctx.chatId } : {}),
      ...(ctx.workspaceContext?.wsId
        ? { workspaceContextWsId: ctx.workspaceContext.wsId }
        : {}),
    },
  });

  if (!budget.ok) {
    return {
      ok: false,
      error: PARALLEL_DENIAL_MESSAGES[budget.code],
    };
  }

  const usageTotals = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };

  try {
    const settledRuns = await Promise.allSettled(
      checks.map((check) =>
        runCheck({
          abortSignal: options?.abortSignal,
          check,
          context,
          maxOutputTokens: budget.perAttemptMaxOutputTokens,
          modelId,
          question,
          toolContext: ctx,
        })
      )
    );

    const results: Array<{ label: CheckKind; finding: string }> = [];
    let firstError: unknown = null;
    for (const entry of settledRuns) {
      if (entry.status === 'fulfilled') {
        usageTotals.inputTokens += entry.value.usage.inputTokens;
        usageTotals.outputTokens += entry.value.usage.outputTokens;
        usageTotals.reasoningTokens += entry.value.usage.reasoningTokens;
        results.push({
          label: entry.value.label,
          finding: entry.value.finding,
        });
      } else if (!firstError) {
        firstError = entry.reason;
      }
    }

    await budget.settle(usageTotals);
    if (firstError) throw firstError;

    const issueCount = results.filter(
      (result) => !/no material issues/i.test(result.finding)
    ).length;

    return {
      ok: true,
      summary:
        issueCount > 0
          ? `Parallel checks found ${issueCount} perspective(s) with material notes.`
          : 'Parallel checks found no material issues.',
      checks: results,
    };
  } catch (error) {
    await budget.settle(usageTotals).catch(() => undefined);

    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        ok: false,
        error: 'Parallel checks were cancelled.',
      };
    }

    return {
      ok: false,
      error: 'Parallel checks failed. Please try again.',
    };
  }
}
