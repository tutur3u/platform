import type { SupabaseClient } from '@tuturuuu/supabase';
import { AI_REQUEST_MAX_OUTPUT_TOKENS } from './constants';
import { resolveGatewayModelId } from './model-mapping';

/**
 * Query the gateway model's output price per token from the database.
 * Returns the flat output_price_per_token. For tiered pricing, returns
 * the highest valid tier cost as a conservative upper bound.
 */
async function getOutputPricePerToken(
  sbAdmin: SupabaseClient,
  modelId: string
): Promise<number | null> {
  const gatewayId = resolveGatewayModelId(modelId);
  const privateDb = sbAdmin.schema('private');

  const { data, error } = await privateDb
    .from('ai_gateway_models')
    .select('output_price_per_token, output_tiers')
    .or(`id.eq.${gatewayId},id.eq.google/${modelId}`)
    .eq('is_enabled', true)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  // Without input-tier context, budget against the most expensive output tier.
  if (
    data.output_tiers &&
    Array.isArray(data.output_tiers) &&
    data.output_tiers.length > 0
  ) {
    const costs = data.output_tiers.map((tier) => {
      const cost = (tier as { cost?: unknown } | null)?.cost;
      return typeof cost === 'number' ||
        (typeof cost === 'string' && cost.trim() !== '')
        ? Number(cost)
        : NaN;
    });
    if (costs.some((cost) => !Number.isFinite(cost) || cost <= 0)) return null;
    return Math.max(...costs);
  }

  return data.output_price_per_token ?? null;
}

/**
 * Application-level safety cap: ensure maxOutputTokens won't exceed
 * what the user can afford based on remaining credits and real gateway pricing.
 *
 * This is a defense-in-depth layer — the database function
 * `check_ai_credit_allowance` applies the same cap, but this catches
 * cases where the DB function is stale or fails open.
 *
 * @returns capped maxOutputTokens, or `null` if no output can be afforded
 */
export async function capMaxOutputTokensByCredits(
  sbAdmin: SupabaseClient,
  modelId: string,
  maxOutputTokens: number | null,
  remainingCredits: number,
  markupMultiplier = 1.0
): Promise<number | null> {
  if (
    !Number.isFinite(remainingCredits) ||
    remainingCredits <= 0 ||
    !Number.isFinite(markupMultiplier) ||
    markupMultiplier < 1
  )
    return null;
  if (
    maxOutputTokens !== null &&
    (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0)
  )
    return null;

  const outputPricePerToken = await getOutputPricePerToken(sbAdmin, modelId);
  if (
    !outputPricePerToken ||
    !Number.isFinite(outputPricePerToken) ||
    outputPricePerToken <= 0
  ) {
    // Missing or invalid prices must not authorize a provider expense.
    return null;
  }

  // credits = (tokens * pricePerToken / 0.0001) * markup
  // → tokens = (credits * 0.0001 / markup) / pricePerToken
  const affordableTokens = Math.floor(
    (remainingCredits * 0.0001) / markupMultiplier / outputPricePerToken
  );

  if (!Number.isFinite(affordableTokens) || affordableTokens < 1) return null;
  return Math.min(
    maxOutputTokens ?? AI_REQUEST_MAX_OUTPUT_TOKENS,
    affordableTokens,
    AI_REQUEST_MAX_OUTPUT_TOKENS
  );
}

/**
 * Pure computation version for unit testing (no DB dependency).
 * Same formula as the async version, but takes price directly.
 */
export function computeAffordableTokens(
  remainingCredits: number,
  outputPricePerToken: number,
  markupMultiplier = 1.0
): number {
  if (
    ![remainingCredits, outputPricePerToken, markupMultiplier].every(
      Number.isFinite
    ) ||
    remainingCredits <= 0 ||
    outputPricePerToken <= 0 ||
    markupMultiplier < 1
  )
    return 0;
  const affordableTokens = Math.floor(
    (remainingCredits * 0.0001) / markupMultiplier / outputPricePerToken
  );
  return Number.isFinite(affordableTokens) ? affordableTokens : 0;
}
