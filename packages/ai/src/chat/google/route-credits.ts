import {
  capMaxOutputTokensByCredits,
  estimateTokenCredits,
  readModelTokenPrices,
  readPlanBudgetPolicy,
} from '@tuturuuu/ai/credits/cap-output-tokens';
import { checkAiCredits } from '@tuturuuu/ai/credits/check-credits';
import {
  readActivePaygCredits,
  readDailyCapacitySnapshot,
  verifyDailyCapacityWithActiveHolds,
} from '@tuturuuu/ai/credits/daily-capacity';
import {
  releaseFixedAiCreditReservation,
  reserveFixedAiCredits,
} from '@tuturuuu/ai/credits/reservations';
import type { SupabaseClient } from '@tuturuuu/supabase';

export {
  createChatReservationSettlement,
  settleOrReleaseChatCreditReservation,
} from './route-credits-settlement';

type AdminRpcClientLike = SupabaseClient;

// Longer than the 120s stream timeout so active streams cannot expire mid-flight.
const CHAT_RESERVATION_TTL_SECONDS = 300;

const SAFE_CREDIT_DENIAL_MESSAGES: Record<string, string> = {
  ACCESS_DENIED:
    'You do not have permission to use AI features in this workspace.',
  CREDITS_EXHAUSTED: 'You have run out of AI credits.',
  DAILY_LIMIT_REACHED: 'Daily AI credit limit reached. Try again tomorrow.',
  DAILY_REQUEST_LIMIT_REACHED:
    'Daily AI request limit reached. Try again tomorrow.',
  FEATURE_NOT_ALLOWED: 'This AI feature is not available on your current plan.',
  INSUFFICIENT_CREDITS: 'You have run out of AI credits.',
  MODEL_NOT_ALLOWED: 'This AI model is not available on your current plan.',
  NO_ALLOCATION: 'AI credits are not enabled for this workspace plan.',
};

function createSafeCreditDenialResponse(
  rawCode: string | null | undefined
): Response {
  if (rawCode === 'CREDIT_CHECK_FAILED') {
    return Response.json(
      {
        error: 'AI request budget could not be verified',
        code: 'CREDIT_CHECK_FAILED',
      },
      { status: 503 }
    );
  }
  const code =
    rawCode && rawCode in SAFE_CREDIT_DENIAL_MESSAGES
      ? rawCode
      : 'ACCESS_DENIED';
  return Response.json(
    {
      error:
        SAFE_CREDIT_DENIAL_MESSAGES[code] ??
        SAFE_CREDIT_DENIAL_MESSAGES.ACCESS_DENIED,
      code,
    },
    { status: 403 }
  );
}

export function estimateProcessedMessagesInputTokens(
  messages: unknown
): number {
  if (!Array.isArray(messages) || messages.length === 0) return 0;
  try {
    const serialized = JSON.stringify(messages);
    return Math.max(1, Math.ceil(serialized.length / 3));
  } catch {
    return 256;
  }
}

export type ChatCreditBudget = {
  cappedMaxOutput: number | null;
  tier?: string;
  reservationId?: string;
  reservedCredits?: number;
  allowNativeSearch?: boolean;
  markupMultiplier?: number;
  inputPricePerToken?: number | null;
  outputPricePerToken?: number | null;
};

type CreditPreflightParams = {
  wsId?: string;
  model: string;
  userId: string;
  sbAdmin: AdminRpcClientLike;
  estimatedInputTokens?: number;
  reserveCredits?: boolean;
  enableNativeSearch?: boolean;
};

export async function performCreditPreflight({
  wsId,
  model,
  userId,
  sbAdmin,
  estimatedInputTokens = 0,
  reserveCredits = false,
  enableNativeSearch = false,
}: CreditPreflightParams): Promise<ChatCreditBudget | { error: Response }> {
  // The allowance RPC remains the admission gate for entitlement, balance, and
  // daily limits. Omit estimatedInputTokens here so the RPC does not reject
  // requests against the full un-capped max output limit before preflight
  // lowers cappedMaxOutput or disables native search to fit remaining credits.
  const allowancePromise = checkAiCredits(wsId ?? undefined, model, 'chat', {
    userId,
  });
  const pricePromise = readModelTokenPrices(sbAdmin, model).then(
    (prices) => ({ prices, error: null as unknown }),
    (error: unknown) => ({ prices: null, error })
  );
  const [creditCheck, priceResult] = await Promise.all([
    allowancePromise,
    pricePromise,
  ]);

  if (creditCheck && !creditCheck.allowed) {
    return {
      error: createSafeCreditDenialResponse(creditCheck.errorCode),
    };
  }

  if (priceResult.error) throw priceResult.error;

  const inputPricePerToken = priceResult.prices?.inputPricePerToken ?? null;
  const outputPricePerToken = priceResult.prices?.outputPricePerToken ?? null;

  if (
    inputPricePerToken === null ||
    !Number.isFinite(inputPricePerToken) ||
    inputPricePerToken < 0 ||
    outputPricePerToken === null ||
    !Number.isFinite(outputPricePerToken) ||
    outputPricePerToken <= 0
  ) {
    return {
      error: createSafeCreditDenialResponse('CREDIT_CHECK_FAILED'),
    };
  }

  const planPolicy = creditCheck
    ? await readPlanBudgetPolicy(sbAdmin, creditCheck.tier).catch(() => null)
    : null;
  if (creditCheck && !planPolicy) {
    return {
      error: createSafeCreditDenialResponse('CREDIT_CHECK_FAILED'),
    };
  }
  const markupMultiplier = planPolicy?.markupMultiplier ?? 1.0;

  let effectiveRemainingCredits = creditCheck?.remainingCredits ?? 0;
  if (
    creditCheck &&
    planPolicy &&
    (planPolicy.dailyLimit !== null || planPolicy.maxRequestsPerDay !== null)
  ) {
    if (planPolicy.dailyLimit !== null) {
      effectiveRemainingCredits = Math.min(
        effectiveRemainingCredits,
        planPolicy.dailyLimit
      );
    }
    const dailySnapshot = await readDailyCapacitySnapshot(sbAdmin, {
      wsId,
      userId,
      tier: creditCheck.tier,
    });
    if (dailySnapshot) {
      if (
        planPolicy.maxRequestsPerDay !== null &&
        dailySnapshot.requestCount + 1 > planPolicy.maxRequestsPerDay
      ) {
        return {
          error: createSafeCreditDenialResponse('DAILY_REQUEST_LIMIT_REACHED'),
        };
      }
      if (planPolicy.dailyLimit !== null) {
        const remainingDaily = Math.max(
          0,
          planPolicy.dailyLimit -
            dailySnapshot.settledCredits -
            dailySnapshot.heldCredits
        );
        if (remainingDaily <= 0) {
          return {
            error: createSafeCreditDenialResponse('DAILY_LIMIT_REACHED'),
          };
        }
        effectiveRemainingCredits = Math.min(
          effectiveRemainingCredits,
          remainingDaily
        );
      }
    }
  }

  const inputCreditCost =
    estimatedInputTokens > 0
      ? estimateTokenCredits({
          inputTokens: estimatedInputTokens,
          inputPricePerToken,
          outputPricePerToken,
          markupMultiplier,
        })
      : 0;

  const searchPrice = priceResult.prices?.searchPrice ?? 0;
  const estimatedNativeSearchUnits = /(?:^|\/)gemini-[12](?:[.-]|$)/.test(model)
    ? 1
    : 4;
  const nativeSearchCredits =
    enableNativeSearch && searchPrice > 0
      ? ((estimatedNativeSearchUnits * searchPrice) / 0.0001) * markupMultiplier
      : 0;

  // Postgres enforces a minimum 1-credit charge for any nonzero usage, so
  // balances below 1 credit cannot settle a request and must be denied upfront.
  if (
    creditCheck &&
    (effectiveRemainingCredits < 1 ||
      inputCreditCost >= effectiveRemainingCredits)
  ) {
    return {
      error: createSafeCreditDenialResponse(
        planPolicy?.dailyLimit !== null &&
          effectiveRemainingCredits < creditCheck.remainingCredits
          ? 'DAILY_LIMIT_REACHED'
          : 'CREDITS_EXHAUSTED'
      ),
    };
  }

  // Gate native Google Search grounding on search affordability before calling
  // the provider. When a workspace can afford tokens but not search grounding,
  // disable native search rather than incurring an unaffordable search charge.
  const canAffordNativeSearch =
    enableNativeSearch &&
    (nativeSearchCredits <= 0 ||
      effectiveRemainingCredits > inputCreditCost + nativeSearchCredits);
  const reservedSearchCredits = canAffordNativeSearch ? nativeSearchCredits : 0;

  const remainingForOutput = creditCheck
    ? Math.max(
        0,
        effectiveRemainingCredits - inputCreditCost - reservedSearchCredits
      )
    : 0;

  // Price output and reasoning conservatively (2x output cap) so the initial
  // step and any subsequent step checks share the same upper-bound math.
  const preliminaryCap = creditCheck
    ? await capMaxOutputTokensByCredits(
        sbAdmin,
        model,
        creditCheck.maxOutputTokens,
        remainingForOutput / 2,
        markupMultiplier,
        outputPricePerToken
      )
    : null;

  if (preliminaryCap === null) {
    return {
      error: createSafeCreditDenialResponse('CREDIT_CHECK_FAILED'),
    };
  }

  if (!reserveCredits) {
    return {
      cappedMaxOutput: preliminaryCap,
      tier: creditCheck?.tier,
      allowNativeSearch: canAffordNativeSearch,
      markupMultiplier,
      inputPricePerToken,
      outputPricePerToken,
    };
  }

  if (!wsId || !creditCheck) {
    return {
      error: createSafeCreditDenialResponse('CREDIT_CHECK_FAILED'),
    };
  }

  const estimatedRequestCredits =
    estimateTokenCredits({
      inputTokens: estimatedInputTokens,
      outputTokens: preliminaryCap,
      reasoningTokens: preliminaryCap,
      inputPricePerToken,
      outputPricePerToken,
      markupMultiplier,
    }) + reservedSearchCredits;
  const desiredReserve = Number.isFinite(estimatedRequestCredits)
    ? Math.max(1, Math.ceil(estimatedRequestCredits))
    : Math.max(1, Math.floor(effectiveRemainingCredits));
  const reservedCredits =
    effectiveRemainingCredits >= 1
      ? Math.min(effectiveRemainingCredits, desiredReserve)
      : effectiveRemainingCredits;

  const reservation = await reserveFixedAiCredits(
    {
      wsId,
      userId,
      amount: reservedCredits,
      modelId: model,
      feature: 'chat',
      expiresInSeconds: CHAT_RESERVATION_TTL_SECONDS,
      metadata: {
        source: 'chat_preflight',
        estimatedInputTokens,
        preliminaryCap,
      },
    },
    sbAdmin
  );

  if (!reservation.success || !reservation.reservationId) {
    // Fixed holds draw only from included and bonus balances. Paid workspaces
    // with active pay-as-you-go credit packs continue on metered post-stream
    // deduction (which consumes included + PAYG packs) while keeping output,
    // daily-limit, and multi-step budget guards active.
    if (
      creditCheck.tier !== 'FREE' &&
      reservation.errorCode === 'INSUFFICIENT_CREDITS'
    ) {
      const paygCredits = await readActivePaygCredits(sbAdmin, wsId);
      if (paygCredits === null) {
        return {
          error: createSafeCreditDenialResponse('CREDIT_CHECK_FAILED'),
        };
      }
      const paygTotalRemaining =
        Math.max(0, reservation.remainingCredits) + paygCredits;
      const admittedCredits = Math.min(
        effectiveRemainingCredits,
        paygTotalRemaining,
        desiredReserve
      );
      if (
        paygCredits > 0 &&
        admittedCredits >= 1 &&
        admittedCredits > inputCreditCost
      ) {
        const paygDailyCheck = await verifyDailyCapacityWithActiveHolds({
          sbAdmin,
          wsId,
          userId,
          tier: creditCheck.tier,
          additionalUnreservedCredits: admittedCredits,
          additionalUnreservedRequests: 1,
          dailyLimit: planPolicy?.dailyLimit ?? null,
          maxRequestsPerDay: planPolicy?.maxRequestsPerDay ?? null,
        });
        if (paygDailyCheck !== 'ok') {
          return {
            error: createSafeCreditDenialResponse(paygDailyCheck),
          };
        }
        const paygAllowsNativeSearch =
          canAffordNativeSearch &&
          (reservedSearchCredits <= 0 ||
            admittedCredits > inputCreditCost + reservedSearchCredits);
        const paygSearchBudget = paygAllowsNativeSearch
          ? reservedSearchCredits
          : 0;
        const paygOutputCap = await capMaxOutputTokensByCredits(
          sbAdmin,
          model,
          preliminaryCap,
          Math.max(0, admittedCredits - inputCreditCost - paygSearchBudget) / 2,
          markupMultiplier,
          outputPricePerToken
        );
        if (paygOutputCap === null) {
          return {
            error: createSafeCreditDenialResponse('CREDITS_EXHAUSTED'),
          };
        }
        return {
          cappedMaxOutput: paygOutputCap,
          tier: creditCheck.tier,
          reservedCredits: admittedCredits,
          allowNativeSearch: paygAllowsNativeSearch,
          markupMultiplier,
          inputPricePerToken,
          outputPricePerToken,
        };
      }
    }

    const code =
      reservation.errorCode === 'INSUFFICIENT_CREDITS' ||
      reservation.errorCode === 'NO_BALANCE'
        ? 'CREDITS_EXHAUSTED'
        : 'CREDIT_CHECK_FAILED';
    return {
      error: createSafeCreditDenialResponse(code),
    };
  }

  const dailyCheck = await verifyDailyCapacityWithActiveHolds({
    sbAdmin,
    reservationId: reservation.reservationId,
    dailyLimit: planPolicy?.dailyLimit ?? null,
    maxRequestsPerDay: planPolicy?.maxRequestsPerDay ?? null,
  });
  if (dailyCheck !== 'ok') {
    await releaseFixedAiCreditReservation(
      reservation.reservationId,
      { source: 'chat_daily_cap_release', wsId, userId, reason: dailyCheck },
      sbAdmin
    ).catch(() => undefined);
    return {
      error: createSafeCreditDenialResponse(dailyCheck),
    };
  }

  // Derive the provider output cap strictly from the held reservation amount.
  const holdAllowsNativeSearch =
    canAffordNativeSearch &&
    (reservedSearchCredits <= 0 ||
      reservedCredits > inputCreditCost + reservedSearchCredits);
  const heldForOutput = Math.max(
    0,
    reservedCredits -
      inputCreditCost -
      (holdAllowsNativeSearch ? reservedSearchCredits : 0)
  );
  const cappedMaxOutput = await capMaxOutputTokensByCredits(
    sbAdmin,
    model,
    preliminaryCap,
    heldForOutput / 2,
    markupMultiplier,
    outputPricePerToken
  );
  if (cappedMaxOutput === null) {
    await releaseFixedAiCreditReservation(
      reservation.reservationId,
      { source: 'chat_held_cap_release', wsId, userId },
      sbAdmin
    ).catch(() => undefined);
    return {
      error: createSafeCreditDenialResponse('CREDITS_EXHAUSTED'),
    };
  }

  return {
    cappedMaxOutput,
    tier: creditCheck.tier,
    reservationId: reservation.reservationId,
    reservedCredits,
    allowNativeSearch: holdAllowsNativeSearch,
    markupMultiplier,
    inputPricePerToken,
    outputPricePerToken,
  };
}

type StepUsageLike = {
  toolResults?: readonly unknown[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    outputTokenDetails?: {
      reasoningTokens?: number;
    };
  };
};

function estimateSerializedTokens(value: unknown): number {
  if (!value) return 0;
  try {
    const serialized = JSON.stringify(value);
    return serialized ? Math.ceil(serialized.length / 3) : 0;
  } catch {
    return 1024;
  }
}

export function hasExhaustedChatCreditBudget(
  steps: readonly StepUsageLike[],
  budget: ChatCreditBudget
): boolean {
  if (!budget.reservedCredits || budget.reservedCredits <= 0) {
    return false;
  }
  if (steps.length === 0) {
    return false;
  }
  // Fail closed if a reservation exists without complete pricing metadata.
  if (
    budget.inputPricePerToken == null ||
    budget.outputPricePerToken == null ||
    !budget.cappedMaxOutput
  ) {
    return true;
  }

  const markupMultiplier = budget.markupMultiplier ?? 1.0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalReasoning = 0;
  let nextStepEstimatedInput = 0;
  for (const step of steps) {
    const stepIn = Math.max(0, step.usage?.inputTokens ?? 0);
    const stepOut = Math.max(0, step.usage?.outputTokens ?? 0);
    const stepReason = Math.max(
      0,
      step.usage?.outputTokenDetails?.reasoningTokens ??
        step.usage?.reasoningTokens ??
        0
    );
    const stepToolResultTokens = step.toolResults?.length
      ? estimateSerializedTokens(step.toolResults)
      : 0;
    totalInput += stepIn;
    totalOutput += stepOut;
    totalReasoning += stepReason;
    nextStepEstimatedInput = Math.max(
      nextStepEstimatedInput,
      stepIn + stepOut + stepToolResultTokens
    );
  }

  const spentCredits = estimateTokenCredits({
    inputTokens: totalInput,
    outputTokens: totalOutput,
    reasoningTokens: totalReasoning,
    inputPricePerToken: budget.inputPricePerToken,
    outputPricePerToken: budget.outputPricePerToken,
    markupMultiplier,
  });

  // Stop before starting another step if its worst-case input (including tool
  // results) + output + reasoning spend could push cumulative usage past the hold.
  const nextStepWorstCaseCredits = estimateTokenCredits({
    inputTokens: nextStepEstimatedInput,
    outputTokens: budget.cappedMaxOutput,
    reasoningTokens: budget.cappedMaxOutput,
    inputPricePerToken: budget.inputPricePerToken,
    outputPricePerToken: budget.outputPricePerToken,
    markupMultiplier,
  });

  return spentCredits + nextStepWorstCaseCredits > budget.reservedCredits;
}
