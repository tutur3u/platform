import type { SupabaseClient } from '@tuturuuu/supabase';
import {
  computeAffordableTokens,
  estimateTokenCredits,
  readModelTokenPrices,
  readPlanBudgetPolicy,
} from './cap-output-tokens';
import {
  checkAiCredits,
  deductAiCredits,
  recordUnbilledAiCharge,
} from './check-credits';
import { AI_REQUEST_MAX_OUTPUT_TOKENS, type AiFeature } from './constants';
import {
  readActivePaygCredits,
  readDailyCapacitySnapshot,
  verifyDailyCapacityWithActiveHolds,
} from './daily-capacity';
import {
  commitFixedAiCreditReservation,
  releaseFixedAiCreditReservation,
  reserveFixedAiCredits,
  settleMeteredAiCreditReservation,
} from './reservations';

const EXPIRED_OR_INACTIVE_RESERVATION_CODES = new Set([
  'RESERVATION_EXPIRED',
  'RESERVATION_NOT_ACTIVE',
  'RESERVATION_NOT_FOUND',
]);
const UNAMBIGUOUS_UNCOMMITTED_RESERVATION_CODES = new Set([
  'RESERVATION_EXPIRED',
  'RESERVATION_NOT_FOUND',
]);

export type NestedBudgetDenialCode =
  | 'ACCESS_DENIED'
  | 'CREDIT_CHECK_FAILED'
  | 'CREDITS_EXHAUSTED'
  | 'DAILY_LIMIT_REACHED'
  | 'FEATURE_NOT_ALLOWED'
  | 'MODEL_NOT_ALLOWED'
  | 'NO_ALLOCATION';

export type ReservedNestedModelBudget =
  | {
      ok: false;
      code: NestedBudgetDenialCode;
      status: 403 | 503;
    }
  | {
      ok: true;
      reservationId: string | null;
      heldCredits: number;
      perAttemptMaxOutputTokens: number;
      settle: (usage: {
        inputTokens: number;
        outputTokens: number;
        reasoningTokens: number;
        searchCount?: number;
      }) => Promise<void>;
      release: () => Promise<void>;
    };

function mapDenialCode(rawCode: string | null | undefined): {
  code: NestedBudgetDenialCode;
  status: 403 | 503;
} {
  switch (rawCode) {
    case 'CREDITS_EXHAUSTED':
    case 'INSUFFICIENT_CREDITS':
    case 'NO_BALANCE':
      return { code: 'CREDITS_EXHAUSTED', status: 403 };
    case 'DAILY_LIMIT_REACHED':
    case 'DAILY_REQUEST_LIMIT_REACHED':
      return { code: 'DAILY_LIMIT_REACHED', status: 403 };
    case 'MODEL_NOT_ALLOWED':
      return { code: 'MODEL_NOT_ALLOWED', status: 403 };
    case 'FEATURE_NOT_ALLOWED':
      return { code: 'FEATURE_NOT_ALLOWED', status: 403 };
    case 'NO_ALLOCATION':
      return { code: 'NO_ALLOCATION', status: 403 };
    case 'CREDIT_CHECK_FAILED':
      return { code: 'CREDIT_CHECK_FAILED', status: 503 };
    default:
      return { code: 'ACCESS_DENIED', status: 403 };
  }
}

export async function reserveNestedModelBudget({
  sbAdmin,
  wsId,
  userId,
  modelId,
  feature = 'chat',
  estimatedInputTokens,
  attemptCount = 1,
  estimatedSearchCount = 0,
  maxReserveCredits,
  maxOutputTokensLimit = AI_REQUEST_MAX_OUTPUT_TOKENS,
  expiresInSeconds = 120,
  metadata = {},
}: {
  sbAdmin: SupabaseClient;
  wsId: string;
  userId: string;
  modelId: string;
  feature?: AiFeature;
  estimatedInputTokens: number;
  attemptCount?: number;
  estimatedSearchCount?: number;
  maxReserveCredits: number;
  maxOutputTokensLimit?: number;
  expiresInSeconds?: number;
  metadata?: Record<string, unknown>;
}): Promise<ReservedNestedModelBudget> {
  const safeAttempts = Math.max(1, Math.trunc(attemptCount));
  const totalEstimatedInput =
    Math.max(1, Math.ceil(estimatedInputTokens)) * safeAttempts;

  const [creditCheck, prices] = await Promise.all([
    // Omit estimatedInputTokens so the allowance RPC does not reject against
    // the full un-capped output limit before nested-budget lowers the output
    // cap to fit remaining credits.
    checkAiCredits(wsId, modelId, feature, {
      userId,
    }),
    readModelTokenPrices(sbAdmin, modelId).catch(() => null),
  ]);

  if (!creditCheck.allowed) {
    const mapped = mapDenialCode(creditCheck.errorCode);
    return { ok: false, ...mapped };
  }

  if (
    !prices ||
    prices.inputPricePerToken === null ||
    prices.inputPricePerToken < 0 ||
    prices.outputPricePerToken === null ||
    prices.outputPricePerToken <= 0
  ) {
    return { ok: false, code: 'CREDIT_CHECK_FAILED', status: 503 };
  }

  const planPolicy = await readPlanBudgetPolicy(
    sbAdmin,
    creditCheck.tier
  ).catch(() => null);
  if (!planPolicy) {
    return { ok: false, code: 'CREDIT_CHECK_FAILED', status: 503 };
  }

  const markupMultiplier = planPolicy.markupMultiplier;
  let effectiveRemainingCredits = creditCheck.remainingCredits;
  if (planPolicy.dailyLimit !== null || planPolicy.maxRequestsPerDay !== null) {
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
        return { ok: false, code: 'DAILY_LIMIT_REACHED', status: 403 };
      }
      if (planPolicy.dailyLimit !== null) {
        const remainingDaily = Math.max(
          0,
          planPolicy.dailyLimit -
            dailySnapshot.settledCredits -
            dailySnapshot.heldCredits
        );
        if (remainingDaily <= 0) {
          return { ok: false, code: 'DAILY_LIMIT_REACHED', status: 403 };
        }
        effectiveRemainingCredits = Math.min(
          effectiveRemainingCredits,
          remainingDaily
        );
      }
    }
  }

  const inputCredits = estimateTokenCredits({
    inputTokens: totalEstimatedInput,
    inputPricePerToken: prices.inputPricePerToken,
    outputPricePerToken: prices.outputPricePerToken,
    markupMultiplier,
  });
  const searchCredits =
    estimatedSearchCount > 0 && (prices.searchPrice ?? 0) > 0
      ? ((estimatedSearchCount * (prices.searchPrice ?? 0)) / 0.0001) *
        markupMultiplier
      : 0;

  // maxReserveCredits caps token reserve headroom while searchCredits reserves
  // full configured search unit pricing on top of the token ceiling.
  const desiredHoldCredits = Math.ceil(
    searchCredits + Math.max(1, maxReserveCredits)
  );
  const heldCredits = Math.min(effectiveRemainingCredits, desiredHoldCredits);

  const computePerAttemptCap = (budgetCredits: number): number => {
    // Reserve headroom for both visible output and reasoning tokens per attempt.
    const remainingForOutput = budgetCredits - inputCredits - searchCredits;
    if (!Number.isFinite(remainingForOutput) || remainingForOutput <= 0) {
      return 0;
    }
    const affordableAcrossAttempts = computeAffordableTokens(
      remainingForOutput / 2,
      prices.outputPricePerToken!,
      markupMultiplier
    );
    const perAttemptBudgetTokens = Math.floor(
      affordableAcrossAttempts / safeAttempts
    );
    if (perAttemptBudgetTokens < 1) return 0;
    return Math.min(
      perAttemptBudgetTokens,
      creditCheck.maxOutputTokens ?? AI_REQUEST_MAX_OUTPUT_TOKENS,
      maxOutputTokensLimit,
      AI_REQUEST_MAX_OUTPUT_TOKENS
    );
  };

  const perAttemptMaxOutputTokens = computePerAttemptCap(heldCredits);
  if (heldCredits < 1 || perAttemptMaxOutputTokens < 1) {
    const code =
      planPolicy.dailyLimit !== null &&
      effectiveRemainingCredits < creditCheck.remainingCredits
        ? 'DAILY_LIMIT_REACHED'
        : 'CREDITS_EXHAUSTED';
    return { ok: false, code, status: 403 };
  }

  const fullMetadata = {
    ...metadata,
    wsId,
    userId,
  };
  const reservation = await reserveFixedAiCredits(
    {
      wsId,
      userId,
      amount: heldCredits,
      modelId,
      feature,
      expiresInSeconds,
      metadata: fullMetadata,
    },
    sbAdmin
  );

  if (!reservation.success || !reservation.reservationId) {
    if (
      creditCheck.tier !== 'FREE' &&
      reservation.errorCode === 'INSUFFICIENT_CREDITS'
    ) {
      const paygCredits = await readActivePaygCredits(sbAdmin, wsId);
      if (paygCredits === null) {
        return { ok: false, code: 'CREDIT_CHECK_FAILED', status: 503 };
      }
      const paygTotalRemaining =
        Math.max(0, reservation.remainingCredits) + paygCredits;
      const admittedCredits = Math.min(
        effectiveRemainingCredits,
        paygTotalRemaining,
        desiredHoldCredits
      );
      const paygPerAttemptCap = computePerAttemptCap(admittedCredits);
      if (paygCredits > 0 && admittedCredits >= 1 && paygPerAttemptCap >= 1) {
        const paygDailyCheck = await verifyDailyCapacityWithActiveHolds({
          sbAdmin,
          wsId,
          userId,
          tier: creditCheck.tier,
          additionalUnreservedCredits: admittedCredits,
          additionalUnreservedRequests: 1,
          dailyLimit: planPolicy.dailyLimit,
          maxRequestsPerDay: planPolicy.maxRequestsPerDay,
        });
        if (paygDailyCheck !== 'ok') {
          return { ok: false, ...mapDenialCode(paygDailyCheck) };
        }
        let settledDirect = false;
        return {
          ok: true,
          reservationId: null,
          heldCredits: admittedCredits,
          perAttemptMaxOutputTokens: paygPerAttemptCap,
          release: async () => {
            settledDirect = true;
          },
          settle: async ({
            inputTokens,
            outputTokens,
            reasoningTokens,
            searchCount = 0,
          }) => {
            if (settledDirect) return;
            settledDirect = true;
            const hasUsage =
              inputTokens > 0 ||
              outputTokens > 0 ||
              reasoningTokens > 0 ||
              searchCount > 0;
            if (!hasUsage) return;
            const direct = await deductAiCredits({
              wsId,
              userId,
              modelId,
              inputTokens,
              outputTokens,
              reasoningTokens,
              feature,
              metadata: fullMetadata,
              ...(searchCount > 0 ? { searchCount } : {}),
            });
            if (!direct.success) {
              console.error('Nested PAYG AI credit deduction failed.', {
                wsId,
                userId,
                modelId,
                feature,
                errorCode: direct.errorCode,
              });
            }
          },
        };
      }
    }

    const mapped = mapDenialCode(
      reservation.errorCode === 'INSUFFICIENT_CREDITS' ||
        reservation.errorCode === 'NO_BALANCE'
        ? 'CREDITS_EXHAUSTED'
        : 'CREDIT_CHECK_FAILED'
    );
    return { ok: false, ...mapped };
  }

  const reservationId = reservation.reservationId;
  const dailyCheck = await verifyDailyCapacityWithActiveHolds({
    sbAdmin,
    reservationId,
    dailyLimit: planPolicy.dailyLimit,
    maxRequestsPerDay: planPolicy.maxRequestsPerDay,
  });
  if (dailyCheck !== 'ok') {
    await releaseFixedAiCreditReservation(
      reservationId,
      { ...fullMetadata, releaseReason: dailyCheck },
      sbAdmin
    ).catch(() => undefined);
    return { ok: false, ...mapDenialCode(dailyCheck) };
  }

  let finalized = false;

  const release = async () => {
    if (finalized) return;
    finalized = true;
    await releaseFixedAiCreditReservation(reservationId, fullMetadata, sbAdmin);
  };

  const settle = async ({
    inputTokens,
    outputTokens,
    reasoningTokens,
    searchCount = 0,
  }: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    searchCount?: number;
  }) => {
    if (finalized) return;
    finalized = true;
    const hasTokens =
      inputTokens > 0 || outputTokens > 0 || reasoningTokens > 0;
    if (!hasTokens && searchCount <= 0) {
      await releaseFixedAiCreditReservation(
        reservationId,
        fullMetadata,
        sbAdmin
      );
      return;
    }

    if (hasTokens) {
      const settled = await settleMeteredAiCreditReservation(
        reservationId,
        {
          inputTokens,
          outputTokens,
          reasoningTokens,
          metadata: fullMetadata,
        },
        sbAdmin
      );
      if (!settled.success) {
        if (
          settled.errorCode &&
          EXPIRED_OR_INACTIVE_RESERVATION_CODES.has(settled.errorCode)
        ) {
          const direct = await deductAiCredits({
            wsId,
            userId,
            modelId,
            inputTokens,
            outputTokens,
            reasoningTokens,
            feature,
            metadata: fullMetadata,
            ...(searchCount > 0 ? { searchCount } : {}),
          });
          if (!direct.success) {
            await recordUnbilledAiCharge({
              wsId,
              userId,
              modelId,
              inputTokens,
              outputTokens,
              reasoningTokens,
              feature,
              ...(searchCount > 0 ? { searchCount } : {}),
              errorCode: direct.errorCode ?? 'DEDUCTION_FAILED',
            });
          }
          return;
        }
        const committed = await commitFixedAiCreditReservation(
          reservationId,
          {
            ...fullMetadata,
            settlementFallback: settled.errorCode ?? 'SETTLEMENT_FAILED',
          },
          sbAdmin
        );
        if (
          !committed.success &&
          committed.errorCode &&
          UNAMBIGUOUS_UNCOMMITTED_RESERVATION_CODES.has(committed.errorCode)
        ) {
          const direct = await deductAiCredits({
            wsId,
            userId,
            modelId,
            inputTokens,
            outputTokens,
            reasoningTokens,
            feature,
            metadata: fullMetadata,
            ...(searchCount > 0 ? { searchCount } : {}),
          });
          if (!direct.success) {
            console.error(
              'Nested credit settlement failed after uncommitted hold.',
              {
                reservationId,
                wsId,
                userId,
                modelId,
                commitError: committed.errorCode,
                deductError: direct.errorCode,
              }
            );
          }
        } else if (!committed.success) {
          // Ambiguous transport outcomes may have committed in Postgres without
          // returning a response; log for reconciliation instead of risking a
          // duplicate charge.
          console.error(
            'Nested credit reservation commit outcome was ambiguous.',
            {
              reservationId,
              wsId,
              userId,
              modelId,
              settlementError: settled.errorCode,
              commitError: committed.errorCode,
            }
          );
        }
        return;
      }
    } else {
      await releaseFixedAiCreditReservation(
        reservationId,
        fullMetadata,
        sbAdmin
      );
    }

    if (searchCount > 0) {
      const searchCharge = await deductAiCredits({
        wsId,
        userId,
        modelId,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        searchCount,
        feature,
        metadata: fullMetadata,
      });
      if (!searchCharge.success) {
        await recordUnbilledAiCharge({
          wsId,
          userId,
          modelId,
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          searchCount,
          feature,
          errorCode: searchCharge.errorCode ?? 'DEDUCTION_FAILED',
        });
      }
    }
  };

  return {
    ok: true,
    reservationId,
    heldCredits,
    perAttemptMaxOutputTokens,
    settle,
    release,
  };
}
