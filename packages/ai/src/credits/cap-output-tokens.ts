import type { SupabaseClient } from '@tuturuuu/supabase';
import { resolveGatewayModelId } from './model-mapping';

/**
 * Query the gateway model's output price per token from the database.
 * Returns the flat output_price_per_token. For tiered pricing, returns
 * the lowest tier cost as a conservative estimate.
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

  // If tiered pricing exists, use the first (lowest) tier cost
  if (
    data.output_tiers &&
    Array.isArray(data.output_tiers) &&
    data.output_tiers.length > 0
  ) {
    const firstTier = data.output_tiers[0] as { cost?: string };
    if (firstTier?.cost) {
      return parseFloat(firstTier.cost);
    }
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
  if (remainingCredits <= 0) return null;

  const outputPricePerToken = await getOutputPricePerToken(sbAdmin, modelId);
  if (!outputPricePerToken || outputPricePerToken <= 0) {
    // Can't determine pricing — fall through to DB-layer cap
    return maxOutputTokens;
  }

  // credits = (tokens * pricePerToken / 0.0001) * markup
  // → tokens = (credits * 0.0001 / markup) / pricePerToken
  const affordableTokens = Math.floor(
    (remainingCredits * 0.0001) / markupMultiplier / outputPricePerToken
  );

  if (affordableTokens < 1) return null;
  if (!maxOutputTokens) return affordableTokens;
  return Math.min(maxOutputTokens, affordableTokens);
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
  if (remainingCredits <= 0 || outputPricePerToken <= 0) return 0;
  return Math.floor(
    (remainingCredits * 0.0001) / markupMultiplier / outputPricePerToken
  );
}
