import type { SupabaseClient } from '@tuturuuu/supabase';
import { AI_REQUEST_MAX_OUTPUT_TOKENS } from './constants';
import { resolveGatewayModelId } from './model-mapping';

function resolveHighestTierCost(
  tiers: unknown,
  fallbackPrice: number | null | undefined
): number | null {
  if (tiers && Array.isArray(tiers) && tiers.length > 0) {
    const costs = tiers.map((tier) => {
      const cost = (tier as { cost?: unknown } | null)?.cost;
      return typeof cost === 'number' ||
        (typeof cost === 'string' && cost.trim() !== '')
        ? Number(cost)
        : NaN;
    });
    if (costs.some((cost) => !Number.isFinite(cost) || cost <= 0)) return null;
    return Math.max(...costs);
  }
  return fallbackPrice ?? null;
}

export type ModelTokenPrices = {
  inputPricePerToken: number | null;
  outputPricePerToken: number | null;
  searchPrice?: number | null;
};

export type PlanBudgetPolicy = {
  markupMultiplier: number;
  dailyLimit: number | null;
  maxRequestsPerDay: number | null;
};

export async function readPlanBudgetPolicy(
  sbAdmin: SupabaseClient,
  tier: string
): Promise<PlanBudgetPolicy | null> {
  if (typeof sbAdmin?.from !== 'function') {
    return { markupMultiplier: 1.0, dailyLimit: null, maxRequestsPerDay: null };
  }
  const { data, error } = await sbAdmin
    .from('ai_credit_plan_allocations')
    .select('markup_multiplier, daily_limit, max_requests_per_day')
    .eq('tier', tier as never)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;

  const rawMarkup = data.markup_multiplier;
  const markupMultiplier =
    typeof rawMarkup === 'number' &&
    Number.isFinite(rawMarkup) &&
    rawMarkup >= 1
      ? rawMarkup
      : 1.0;

  return {
    markupMultiplier,
    dailyLimit:
      typeof data.daily_limit === 'number' && Number.isFinite(data.daily_limit)
        ? data.daily_limit
        : null,
    maxRequestsPerDay:
      typeof data.max_requests_per_day === 'number' &&
      Number.isFinite(data.max_requests_per_day)
        ? data.max_requests_per_day
        : null,
  };
}

export async function readModelTokenPrices(
  sbAdmin: SupabaseClient,
  modelId: string
): Promise<ModelTokenPrices> {
  const gatewayId = resolveGatewayModelId(modelId);
  const privateDb = sbAdmin.schema('private');

  const { data, error } = await privateDb
    .from('ai_gateway_models')
    .select(
      'input_price_per_token, input_tiers, output_price_per_token, output_tiers, search_price'
    )
    .or(`id.eq.${gatewayId},id.eq.google/${modelId}`)
    .eq('is_enabled', true)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      inputPricePerToken: null,
      outputPricePerToken: null,
      searchPrice: null,
    };
  }

  return {
    inputPricePerToken: resolveHighestTierCost(
      data.input_tiers,
      data.input_price_per_token
    ),
    outputPricePerToken: resolveHighestTierCost(
      data.output_tiers,
      data.output_price_per_token
    ),
    searchPrice:
      typeof data.search_price === 'number' &&
      Number.isFinite(data.search_price) &&
      data.search_price >= 0
        ? data.search_price
        : 0,
  };
}

/**
 * Query the gateway model's output price per token from the database.
 * Returns the flat output_price_per_token. For tiered pricing, returns
 * the highest valid tier cost as a conservative upper bound.
 */
async function getOutputPricePerToken(
  sbAdmin: SupabaseClient,
  modelId: string
): Promise<number | null> {
  const prices = await readModelTokenPrices(sbAdmin, modelId);
  return prices.outputPricePerToken;
}

/** Estimate credit cost for token usage using the gateway pricing formula. */
export function estimateTokenCredits({
  inputTokens = 0,
  outputTokens = 0,
  reasoningTokens = 0,
  inputPricePerToken,
  outputPricePerToken,
  markupMultiplier = 1.0,
}: {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  inputPricePerToken: number;
  outputPricePerToken: number;
  markupMultiplier?: number;
}): number {
  const safeInput = Math.max(0, inputTokens);
  const safeOutput = Math.max(0, outputTokens) + Math.max(0, reasoningTokens);
  if (
    !Number.isFinite(inputPricePerToken) ||
    inputPricePerToken < 0 ||
    !Number.isFinite(outputPricePerToken) ||
    outputPricePerToken <= 0 ||
    !Number.isFinite(markupMultiplier) ||
    markupMultiplier < 1
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const costUsd =
    safeInput * inputPricePerToken + safeOutput * outputPricePerToken;
  return (costUsd / 0.0001) * markupMultiplier;
}

/** Read-only price lookup. A price is not an allowance and never admits a request. */
export function readOutputPricePerToken(
  sbAdmin: SupabaseClient,
  modelId: string
): Promise<number | null> {
  return getOutputPricePerToken(sbAdmin, modelId);
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
  markupMultiplier = 1.0,
  prefetchedOutputPricePerToken?: number | null
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

  const outputPricePerToken =
    prefetchedOutputPricePerToken !== undefined
      ? prefetchedOutputPricePerToken
      : await getOutputPricePerToken(sbAdmin, modelId);
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
