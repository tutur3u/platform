import { google } from '@ai-sdk/google';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  gateway,
  type LanguageModelUsage,
  stepCountIs,
  ToolLoopAgent,
} from 'ai';
import { z } from 'zod';
import { capMaxOutputTokensByCredits } from '../../credits/cap-output-tokens';
import { checkAiCredits, deductAiCredits } from '../../credits/check-credits';
import {
  GEMINI_31_FLASH_LITE_MODEL,
  isGoogleModelId,
  toBareModelName,
} from '../../credits/model-mapping';
import {
  PlanModelResolutionError,
  resolvePlanModel,
} from '../../credits/resolve-plan-model';
import { withAiMemory } from '../../memory';
import type { MiraToolContext } from '../mira-tools';

const PARALLEL_CHECKS_MODEL = GEMINI_31_FLASH_LITE_MODEL;

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

type ParallelCheckResult = {
  label: string;
  finding: string;
};

type MeteredUsage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

const CHECK_INSTRUCTIONS: Record<CheckKind, string> = {
  assumptions:
    'You identify hidden assumptions, missing premises, and unclear decision points. Return concise findings only.',
  factuality:
    'You check whether claims need verification, external evidence, or clearer source attribution. Return concise findings only.',
  implementation:
    'You review implementation feasibility, sequencing, interfaces, and likely integration risks. Return concise findings only.',
  risk: 'You review failure modes, user-impact risks, regressions, and test gaps. Return concise findings only.',
};

const DEFAULT_CHECKS: CheckKind[] = ['assumptions', 'factuality', 'risk'];

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

function getCreditCheckErrorMessage(creditCheck: {
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const errorMessages: Record<string, string> = {
    CREDIT_CHECK_FAILED: 'AI credit check failed. Please try again.',
    CREDITS_EXHAUSTED: 'You have run out of AI credits for parallel checks.',
    FEATURE_NOT_ALLOWED:
      'Parallel checks are not available on your current plan.',
    MODEL_NOT_ALLOWED:
      'The parallel-checks model is not enabled for your workspace.',
    NO_ALLOCATION: 'AI credits are not configured for your workspace.',
  };

  return (
    creditCheck.errorMessage ??
    errorMessages[creditCheck.errorCode ?? ''] ??
    'Parallel checks are not available. Please check your AI credit settings.'
  );
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
      usage.outputTokenDetails.reasoningTokens
    ),
  };
}

function getPerCheckMaxOutputTokens(
  cappedMaxOutput: number | null,
  checkCount: number
) {
  if (cappedMaxOutput === null) return undefined;
  return Math.max(1, Math.floor(cappedMaxOutput / checkCount));
}

async function runCheck({
  abortSignal,
  billingWsId,
  check,
  context,
  maxOutputTokens,
  modelId,
  question,
  toolContext,
}: {
  abortSignal?: AbortSignal;
  billingWsId: string;
  check: CheckKind;
  context?: string;
  maxOutputTokens?: number;
  modelId: string;
  question: string;
  toolContext: MiraToolContext;
}): Promise<ParallelCheckResult> {
  const useGoogleNativeModel = isGoogleModelId(modelId);
  const agent = new ToolLoopAgent({
    model: await withAiMemory({
      addMemory: 'never',
      customId: toolContext.chatId
        ? `${toolContext.chatId}-parallel-checks-${check}`
        : `parallel-checks-${check}`,
      model: useGoogleNativeModel
        ? google(toBareModelName(modelId))
        : gateway(modelId),
      product: 'mira',
      source: 'mira_parallel_checks_tool',
      surface: 'mira_parallel_checks_tool',
      userId: toolContext.userId,
      wsId: toolContext.workspaceContext?.wsId ?? toolContext.wsId,
    }),
    instructions: CHECK_INSTRUCTIONS[check],
    stopWhen: stepCountIs(2),
    ...(useGoogleNativeModel
      ? {
          providerOptions: {
            google: {
              thinkingConfig: {
                thinkingBudget: 0,
                includeThoughts: false,
              },
            },
          },
        }
      : {}),
  });

  const result = await agent.generate({
    prompt: buildPrompt({ check, context, question }),
    abortSignal,
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
  });

  const usage = extractMeteredUsage(result.totalUsage);
  const deduction = await deductAiCredits({
    wsId: billingWsId,
    userId: toolContext.userId,
    modelId,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    feature: 'chat',
    metadata: {
      source: 'mira_parallel_checks_tool',
      check,
      creditWsId: billingWsId,
      routeWsId: toolContext.wsId,
      ...(toolContext.chatId ? { chatId: toolContext.chatId } : {}),
      ...(toolContext.workspaceContext?.wsId
        ? { workspaceContextWsId: toolContext.workspaceContext.wsId }
        : {}),
    },
  });

  if (!deduction.success) {
    throw new Error('Failed to deduct AI credits for parallel checks.');
  }

  return {
    label: check,
    finding: result.text.trim() || 'No material issues.',
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

  try {
    const resolvedModel = await resolvePlanModel({
      capability: 'language',
      requestedModel: PARALLEL_CHECKS_MODEL,
      wsId: billingWsId,
    });
    const modelId = resolvedModel.modelId;
    const creditCheck = await checkAiCredits(billingWsId, modelId, 'chat', {
      userId: ctx.userId,
    });

    if (!creditCheck.allowed) {
      return {
        ok: false,
        error: getCreditCheckErrorMessage(creditCheck),
      };
    }

    const sbAdmin = await createAdminClient();
    const cappedMaxOutput = await capMaxOutputTokensByCredits(
      sbAdmin,
      modelId,
      creditCheck.maxOutputTokens,
      creditCheck.remainingCredits
    );

    if (cappedMaxOutput === null && creditCheck.remainingCredits <= 0) {
      return {
        ok: false,
        error: 'You have run out of AI credits for parallel checks.',
      };
    }

    const maxOutputTokens = getPerCheckMaxOutputTokens(
      cappedMaxOutput,
      checks.length
    );

    const results = await Promise.all(
      checks.map((check) =>
        runCheck({
          abortSignal: options?.abortSignal,
          billingWsId,
          check,
          context,
          maxOutputTokens,
          modelId,
          question,
          toolContext: ctx,
        })
      )
    );

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
    if (error instanceof PlanModelResolutionError) {
      return {
        ok: false,
        error: error.message,
      };
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        ok: false,
        error: 'Parallel checks were cancelled.',
      };
    }

    console.error('executeParallelChecks provider error:', error);
    return {
      ok: false,
      error: 'Parallel checks failed. Please try again.',
    };
  }
}
