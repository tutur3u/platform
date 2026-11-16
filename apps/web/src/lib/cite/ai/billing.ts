import 'server-only';

import {
  capMaxOutputTokensByCredits,
  readOutputPricePerToken,
} from '@tuturuuu/ai/credits/cap-output-tokens';
import {
  checkAiCredits,
  deductAiCredits,
} from '@tuturuuu/ai/credits/check-credits';
import { resolvePlanModel } from '@tuturuuu/ai/credits/resolve-plan-model';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import {
  CitationAiError,
  type CitationAiBinding,
  type CitationAiCheckpoint,
  type CitationDurableChargeRead,
  citationFixRequestSchema,
  CITE_AI_OPERATION_FUTURE_TOLERANCE_MS,
  validateCitationOperationTime,
} from './contracts';
import { boundedCitationOperation } from './timeout';

const featureQuerySchema = z.object({
  data: z.object({ enabled: z.boolean() }).nullable(),
  error: z.null(),
});
const allocationQuerySchema = z.object({
  data: z.object({ markup_multiplier: z.number() }).nullable(),
  error: z.null(),
});
const modelRateQuerySchema = z.object({
  data: z.object({ output_price_per_token: z.number().nullable() }).nullable(),
  error: z.null(),
});

export async function admitCitationAi(
  binding: CitationAiBinding,
  estimatedInputTokens: number
) {
  const plan = await boundedCitationOperation(
    resolvePlanModel({ wsId: binding.billingWsId, capability: 'language' })
  );
  const admin = await createAdminClient();
  const featureResult = featureQuerySchema.safeParse(
    await boundedCitationOperation(
      admin
        .from('ai_credit_feature_access')
        .select('enabled')
        .eq('tier', plan.tier)
        .eq('feature', binding.feature)
        .maybeSingle()
    )
  );
  if (!featureResult.success)
    throw new CitationAiError('CREDIT_CHECK_FAILED', 503);
  if (featureResult.data.data?.enabled !== true)
    throw new CitationAiError('FEATURE_NOT_ALLOWED', 403);
  const allowance = await boundedCitationOperation(
    checkAiCredits(binding.billingWsId, plan.modelId, binding.feature, {
      userId: binding.userId,
      estimatedInputTokens,
    })
  );
  if (!allowance.allowed) {
    if (allowance.errorCode === 'FEATURE_NOT_ALLOWED')
      throw new CitationAiError('FEATURE_NOT_ALLOWED', 403);
    if (
      allowance.errorCode === 'CREDIT_CHECK_FAILED' ||
      allowance.errorCode === 'NO_ALLOCATION' ||
      allowance.errorCode === 'NO_BALANCE' ||
      allowance.errorCode === 'MODEL_PRICING_UNAVAILABLE'
    )
      throw new CitationAiError('CREDIT_CHECK_FAILED', 503);
    if (
      allowance.errorCode === 'MODEL_DISABLED' ||
      allowance.errorCode === 'MODEL_NOT_ALLOWED'
    )
      throw new CitationAiError('FEATURE_NOT_ALLOWED', 403);
    throw new CitationAiError('CREDITS_EXHAUSTED', 403);
  }
  const allocationResult = allocationQuerySchema.safeParse(
    await boundedCitationOperation(
      admin
        .from('ai_credit_plan_allocations')
        .select('markup_multiplier')
        .eq('id', plan.allocationId)
        .eq('is_active', true)
        .maybeSingle()
    )
  );
  if (!allocationResult.success || !allocationResult.data.data)
    throw new CitationAiError('CREDIT_CHECK_FAILED', 503);
  const allocation = allocationResult.data.data;
  const [tierRate, flatResponse] = await Promise.all([
    boundedCitationOperation(readOutputPricePerToken(admin, plan.modelId)),
    boundedCitationOperation(
      admin
        .schema('private')
        .from('ai_gateway_models')
        .select('output_price_per_token')
        .eq('id', plan.modelId)
        .eq('is_enabled', true)
        .maybeSingle()
    ),
  ]);
  const flat = modelRateQuerySchema.safeParse(flatResponse);
  const baseRate = flat.success
    ? flat.data.data?.output_price_per_token
    : undefined;
  if (
    !flat.success ||
    typeof baseRate !== 'number' ||
    !Number.isFinite(baseRate) ||
    baseRate <= 0 ||
    typeof tierRate !== 'number' ||
    !Number.isFinite(tierRate) ||
    tierRate <= 0
  )
    throw new CitationAiError('CREDIT_CHECK_FAILED', 503);
  // A combined response-token cap covers text tiers and the flat reasoning rate.
  const outputRateCeiling = Math.max(tierRate, baseRate);
  const maxOutputTokens = await boundedCitationOperation(
    capMaxOutputTokensByCredits(
      admin,
      plan.modelId,
      Math.min(allowance.maxOutputTokens ?? 8192, 8192),
      allowance.remainingCredits,
      allocation.markup_multiplier,
      outputRateCeiling
    )
  );
  if (!maxOutputTokens) throw new CitationAiError('CREDITS_EXHAUSTED', 403);
  return { modelId: plan.modelId, maxOutputTokens };
}

const durableChargeRowsSchema = z
  .array(
    z.object({
      ws_id: z.uuid().nullable(),
      user_id: z.uuid().nullable(),
      feature: z.string().nullable(),
      metadata: z.record(z.string(), z.unknown()).nullable(),
    })
  )
  .max(2);
const durableChargeQuerySchema = z.object({
  data: durableChargeRowsSchema,
  error: z.null(),
});
const LEDGER_CLOCK_MARGIN_MS = 60 * 1000;

/** Pool-or-actor identity covers paid workspace rows and nullable personal-balance rows. */
export async function readCitationDurableCharge(
  operationId: string,
  binding: CitationAiBinding
): Promise<CitationDurableChargeRead> {
  try {
    const parsedId =
      citationFixRequestSchema.shape.operationId.safeParse(operationId);
    if (!parsedId.success) return { kind: 'unavailable' };
    const actor = z.uuid().safeParse(binding.userId);
    const pool = z.uuid().safeParse(binding.billingWsId);
    if (!actor.success || !pool.success) return { kind: 'unavailable' };
    const actorId = actor.data.toLowerCase();
    const billingWsId = pool.data.toLowerCase();
    const canonicalId = parsedId.data;
    const now = Date.now();
    validateCitationOperationTime(canonicalId, now);
    const issuedAt = Number.parseInt(
      canonicalId.slice(0, 8) + canonicalId.slice(9, 13),
      16
    );
    const from = new Date(
      issuedAt - CITE_AI_OPERATION_FUTURE_TOLERANCE_MS - LEDGER_CLOCK_MARGIN_MS
    ).toISOString();
    const through = new Date(now + LEDGER_CLOCK_MARGIN_MS).toISOString();
    const admin = await createAdminClient();
    const response = await boundedCitationOperation(
      admin
        .from('ai_credit_transactions')
        .select('ws_id,user_id,feature,metadata')
        .eq('transaction_type', 'deduction')
        .or(`ws_id.eq.${billingWsId},user_id.eq.${actorId}`)
        .gte('created_at', from)
        .lte('created_at', through)
        .contains('metadata', { citeOperationId: canonicalId })
        .limit(2)
    );
    const parsed = durableChargeQuerySchema.safeParse(response);
    if (!parsed.success) return { kind: 'unavailable' };
    const charges = parsed.data.data;
    if (charges.length === 0) return { kind: 'absent' };
    if (charges.length !== 1) return { kind: 'unavailable' };
    const charge = charges[0];
    if (!charge) return { kind: 'unavailable' };
    return {
      kind: 'charged',
      bindingMatches:
        charge.user_id === actorId &&
        (charge.ws_id === null || charge.ws_id === billingWsId) &&
        charge.feature === binding.feature &&
        charge.metadata?.citeOperationId === canonicalId &&
        charge.metadata?.citeBillingWorkspaceId === billingWsId &&
        charge.metadata?.citeInputHash === binding.inputHash,
    };
  } catch {
    return { kind: 'unavailable' };
  }
}

export async function deductCitationAi(
  operationId: string,
  checkpoint: CitationAiCheckpoint
) {
  return boundedCitationOperation(
    deductAiCredits({
      wsId: checkpoint.binding.billingWsId,
      userId: checkpoint.binding.userId,
      modelId: checkpoint.modelId,
      feature: checkpoint.binding.feature,
      ...checkpoint.usage,
      metadata: {
        source: 'cite_fix_ref',
        citeOperationId: operationId,
        citeBillingWorkspaceId: checkpoint.binding.billingWsId,
        citeInputHash: checkpoint.binding.inputHash,
      },
    })
  );
}

const chargeRowsSchema = z
  .array(z.object({ amount: z.number().finite().nonpositive() }))
  .max(2);
const chargeQuerySchema = z.object({
  data: chargeRowsSchema,
  error: z.null(),
});
/** Absence and ambiguity never authorize another deduction. User balances may have no ws_id. */
export async function recoverCitationCharge(
  operationId: string,
  binding: CitationAiBinding
) {
  const admin = await createAdminClient();
  const response = await boundedCitationOperation(
    admin
      .from('ai_credit_transactions')
      .select('amount')
      .eq('user_id', binding.userId)
      .eq('feature', binding.feature)
      .eq('transaction_type', 'deduction')
      .contains('metadata', {
        citeOperationId: operationId,
        citeBillingWorkspaceId: binding.billingWsId,
        citeInputHash: binding.inputHash,
      })
      .limit(2)
  );
  const parsed = chargeQuerySchema.safeParse(response);
  if (!parsed.success || parsed.data.data.length !== 1) return null;
  const charge = parsed.data.data[0];
  return charge ? Math.abs(charge.amount) : null;
}
