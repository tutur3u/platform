import 'server-only';
import {
  isGoogleModelId,
  toBareModelName,
} from '@tuturuuu/ai/credits/model-mapping';
import { resolvePlanModel } from '@tuturuuu/ai/credits/resolve-plan-model';
import type { MeetChatModel } from '@tuturuuu/ai/meetings/chat-usage';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MeetCallAccessError } from '../lib/call-access';

export async function getMeetChatModel(wsId: string): Promise<MeetChatModel> {
  const { modelId } = await resolvePlanModel({ wsId, capability: 'language' });
  if (!isGoogleModelId(modelId))
    throw new MeetCallAccessError(
      403,
      'Meeting AI requires a Google plan model'
    );
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await db
    .schema('private')
    .from('ai_gateway_models')
    .select(
      'input_price_per_token, output_price_per_token, cache_read_price_per_token, input_tiers, output_tiers'
    )
    .eq('id', modelId)
    .eq('is_enabled', true)
    .single();
  const validPrice = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (
    error ||
    !data ||
    !validPrice(data.input_price_per_token) ||
    !validPrice(data.output_price_per_token)
  )
    throw new MeetCallAccessError(503, 'Meeting AI pricing is unavailable');
  return {
    id: modelId,
    providerModelId: toBareModelName(modelId),
    inputPricePerToken: data.input_price_per_token,
    outputPricePerToken: data.output_price_per_token,
    cacheReadPricePerToken: validPrice(data.cache_read_price_per_token)
      ? data.cache_read_price_per_token
      : null,
    // Tiered prices need context thresholds. Do not silently report a flat
    // price as complete when the catalog specifies a different billing rule.
    tieredPricing: [data.input_tiers, data.output_tiers].some(
      (tiers) => tiers !== null && (!Array.isArray(tiers) || tiers.length > 0)
    ),
  };
}
