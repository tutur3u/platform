import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  decrementAiCreditChargeInFlight,
  hasAiCreditChargeInFlight,
  incrementAiCreditChargeInFlight,
  invalidateAiCreditSnapshot,
  isAiCreditSnapshotUsable,
  readAiCreditSnapshot,
} from '@tuturuuu/utils/ai-temp-auth';
import type { AiFeature, CreditErrorCode } from './constants';
import { matchesAllowedModel, resolveGatewayModelId } from './model-mapping';
import type {
  CreditCheckResult,
  CreditDeductionResult,
  DeductCreditsParams,
} from './types';

type DeductAiCreditsRpcRow = {
  success?: boolean;
  credits_deducted?: number | string;
  remaining_credits?: number | string;
  error_code?: string | null;
};

type RpcError = { message?: string } | null;

/**
 * Pre-flight check: can this workspace use AI credits for the given model/feature?
 * Returns allowance info including remaining credits and effective maxOutputTokens.
 */
export async function checkAiCredits(
  wsId: string | undefined,
  modelId: string,
  feature: AiFeature,
  opts?: { userId?: string; estimatedInputTokens?: number }
): Promise<CreditCheckResult> {
  if (!wsId) {
    return {
      allowed: false,
      remainingCredits: 0,
      tier: 'FREE',
      maxOutputTokens: null,
      errorCode: 'CREDIT_CHECK_FAILED',
      errorMessage: 'Workspace ID is missing.',
    };
  }

  const gatewayModelId = resolveGatewayModelId(modelId);

  if (opts?.userId) {
    const snapshot = await readAiCreditSnapshot({
      wsId,
      userId: opts.userId,
    });
    const inFlight = await hasAiCreditChargeInFlight({
      wsId,
      userId: opts.userId,
    });
    if (
      isAiCreditSnapshotUsable(snapshot, { inFlight }) &&
      (snapshot.allowedFeatures.length === 0 ||
        snapshot.allowedFeatures.includes(feature)) &&
      matchesAllowedModel(gatewayModelId, snapshot.allowedModels)
    ) {
      return {
        allowed: snapshot.remainingCredits > 0,
        remainingCredits: snapshot.remainingCredits,
        tier: snapshot.tier,
        maxOutputTokens: snapshot.maxOutputTokens,
        errorCode: snapshot.remainingCredits > 0 ? null : 'CREDITS_EXHAUSTED',
        errorMessage:
          snapshot.remainingCredits > 0
            ? null
            : 'AI credits exhausted. Please upgrade your plan or purchase more credits.',
      };
    }
  }

  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin.rpc('check_ai_credit_allowance', {
    p_ws_id: wsId,
    p_model_id: gatewayModelId,
    p_feature: feature,
    ...(opts?.estimatedInputTokens != null
      ? { p_estimated_input_tokens: opts.estimatedInputTokens }
      : {}),
    ...(opts?.userId ? { p_user_id: opts.userId } : {}),
  });

  if (error) {
    console.error('Error checking AI credits:', error);
    return {
      allowed: false,
      remainingCredits: 0,
      tier: 'FREE',
      maxOutputTokens: null,
      errorCode: 'CREDIT_CHECK_FAILED',
      errorMessage: 'AI credit check failed. Please try again.',
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      allowed: false,
      remainingCredits: 0,
      tier: 'FREE',
      maxOutputTokens: null,
      errorCode: 'CREDIT_CHECK_FAILED',
      errorMessage: 'AI credit check returned no result. Please try again.',
    };
  }

  return {
    allowed: row.allowed ?? true,
    remainingCredits: Number(row.remaining_credits ?? 0),
    tier: row.tier ?? 'FREE',
    maxOutputTokens: row.max_output_tokens ?? null,
    errorCode: (row.error_code as CreditErrorCode) ?? null,
    errorMessage: row.error_message ?? null,
  };
}

/**
 * Deduct credits after a successful AI execution.
 * Should be called in the `onFinish` callback or after `generateObject` completes.
 */
export async function deductAiCredits(
  params: DeductCreditsParams
): Promise<CreditDeductionResult> {
  if (!params.wsId) {
    return {
      success: false,
      creditsDeducted: 0,
      remainingCredits: 0,
      errorCode: 'DEDUCTION_FAILED',
    };
  }

  const wsId = params.wsId;
  const sbAdmin = await createAdminClient();
  const gatewayModelId = resolveGatewayModelId(params.modelId);
  let inFlightMarked = false;

  if (params.userId) {
    inFlightMarked = await incrementAiCreditChargeInFlight({
      wsId,
      userId: params.userId,
    });
  }

  let data: DeductAiCreditsRpcRow[] | DeductAiCreditsRpcRow | null = null;
  let error: RpcError = null;

  try {
    const response = await sbAdmin.rpc('deduct_ai_credits', {
      p_ws_id: wsId,
      p_model_id: gatewayModelId,
      p_input_tokens: params.inputTokens,
      p_output_tokens: params.outputTokens,
      p_reasoning_tokens: params.reasoningTokens ?? 0,
      p_feature: params.feature,
      ...(params.executionId ? { p_execution_id: params.executionId } : {}),
      ...(params.chatMessageId
        ? { p_chat_message_id: params.chatMessageId }
        : {}),
      ...(params.metadata
        ? {
            p_metadata:
              params.metadata as unknown as import('@tuturuuu/types').Json,
          }
        : {}),
      ...(params.userId ? { p_user_id: params.userId } : {}),
      ...(params.imageCount ? { p_image_count: params.imageCount } : {}),
      ...(params.searchCount ? { p_search_count: params.searchCount } : {}),
    });
    data = response.data as
      | DeductAiCreditsRpcRow[]
      | DeductAiCreditsRpcRow
      | null;
    error = response.error as RpcError;
  } finally {
    if (inFlightMarked && params.userId) {
      await decrementAiCreditChargeInFlight({
        wsId,
        userId: params.userId,
      });
    }
  }

  if (error) {
    console.error('Error deducting AI credits:', error);
    return {
      success: false,
      creditsDeducted: 0,
      remainingCredits: 0,
      errorCode: 'DEDUCTION_FAILED',
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      success: false,
      creditsDeducted: 0,
      remainingCredits: 0,
      errorCode: 'NO_RESULT',
    };
  }

  const result = {
    success: row.success ?? false,
    creditsDeducted: Number(row.credits_deducted ?? 0),
    remainingCredits: Number(row.remaining_credits ?? 0),
    errorCode: row.error_code ?? null,
  };

  if (result.success && params.wsId && params.userId) {
    await invalidateAiCreditSnapshot({
      wsId,
      userId: params.userId,
    });
  }

  return result;
}
