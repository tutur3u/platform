import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { AiFeature, CreditErrorCode } from './constants';
import { resolveGatewayModelId } from './model-mapping';
import type {
  CreditCheckResult,
  CreditDeductionResult,
  DeductCreditsParams,
} from './types';

/**
 * Pre-flight check: can this workspace use AI credits for the given model/feature?
 * Returns allowance info including remaining credits and effective maxOutputTokens.
 */
export async function checkAiCredits(
  wsId: string,
  modelId: string,
  feature: AiFeature,
  opts?: { userId?: string; estimatedInputTokens?: number }
): Promise<CreditCheckResult> {
  const sbAdmin = await createAdminClient();
  const gatewayModelId = resolveGatewayModelId(modelId);

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
      allowed: true, // Fail-open: allow if credit check itself fails
      remainingCredits: 0,
      tier: 'FREE',
      maxOutputTokens: null,
      errorCode: null,
      errorMessage: null,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      allowed: true,
      remainingCredits: 0,
      tier: 'FREE',
      maxOutputTokens: null,
      errorCode: null,
      errorMessage: null,
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
  const sbAdmin = await createAdminClient();
  const gatewayModelId = resolveGatewayModelId(params.modelId);

  const { data, error } = await sbAdmin.rpc('deduct_ai_credits', {
    p_ws_id: params.wsId,
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
  });

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

  return {
    success: row.success ?? false,
    creditsDeducted: Number(row.credits_deducted ?? 0),
    remainingCredits: Number(row.remaining_credits ?? 0),
    errorCode: row.error_code ?? null,
  };
}
