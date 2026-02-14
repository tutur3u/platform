import type { SupabaseClient } from '@tuturuuu/supabase';

interface GatewayModelPricing {
  // Vercel AI Gateway uses these field names (values are strings)
  input?: string;
  output?: string;
  input_cache_read?: string;
  input_cache_write?: string;
  web_search?: string;
  input_tiers?: Array<{ cost: string; min: number; max?: number }>;
  output_tiers?: Array<{ cost: string; min: number; max?: number }>;
}

interface GatewayModel {
  id: string;
  name: string;
  // Gateway uses 'created' not 'provider' at top level
  created?: number;
  description?: string;
  // Gateway uses 'architecture.modality' not 'type'
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  context_length?: number;
  top_provider?: { max_completion_tokens?: number; context_length?: number };
  pricing?: GatewayModelPricing;
}

interface SyncResult {
  synced: number;
  new: number;
  updated: number;
  errors: string[];
}

const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/models';

/**
 * Fetches model data from the Vercel AI Gateway and upserts into ai_gateway_models.
 * Does NOT auto-enable models — admin must explicitly enable via is_enabled.
 */
export async function syncGatewayModels(
  sbAdmin: SupabaseClient
): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, new: 0, updated: 0, errors: [] };

  const response = await fetch(GATEWAY_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch gateway models: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  const models: GatewayModel[] = Array.isArray(data)
    ? data
    : (data?.data ?? data?.models ?? []);

  if (models.length === 0) {
    result.errors.push('No models returned from gateway');
    return result;
  }

  // Count existing models for new vs updated detection
  const { data: existingIds } = await sbAdmin
    .from('ai_gateway_models')
    .select('id');
  const existingIdSet = new Set(
    (existingIds ?? []).map((row: { id: string }) => row.id)
  );

  const rows = models.map((m) => {
    const provider = m.id.split('/')[0] || 'unknown';
    const modelName = m.id.split('/').slice(1).join('/') || m.id;

    return {
      id: m.id,
      name: m.name || modelName,
      provider,
      description: m.description || null,
      type: m.architecture?.modality || 'language',
      context_window:
        m.context_length ?? m.top_provider?.context_length ?? null,
      max_tokens: m.top_provider?.max_completion_tokens ?? null,
      tags: [],
      input_price_per_token: parseFloat(m.pricing?.input ?? '0'),
      output_price_per_token: parseFloat(m.pricing?.output ?? '0'),
      input_tiers: m.pricing?.input_tiers ?? null,
      output_tiers: m.pricing?.output_tiers ?? null,
      cache_read_price_per_token: m.pricing?.input_cache_read
        ? parseFloat(m.pricing.input_cache_read)
        : null,
      cache_write_price_per_token: m.pricing?.input_cache_write
        ? parseFloat(m.pricing.input_cache_write)
        : null,
      web_search_price: m.pricing?.web_search
        ? parseFloat(m.pricing.web_search)
        : null,
      released_at: m.created ? new Date(m.created * 1000).toISOString() : null,
      synced_at: new Date().toISOString(),
    };
  });

  // Upsert in batches of 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await sbAdmin
      .from('ai_gateway_models')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      result.errors.push(`Batch ${i / BATCH_SIZE}: ${error.message}`);
    } else {
      for (const row of batch) {
        result.synced++;
        if (existingIdSet.has(row.id)) {
          result.updated++;
        } else {
          result.new++;
        }
      }
    }
  }

  return result;
}
