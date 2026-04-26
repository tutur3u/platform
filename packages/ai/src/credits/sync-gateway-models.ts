import type { SupabaseClient } from '@tuturuuu/supabase';

export type GatewayModelSyncSource =
  | 'tuturuuu-production-public'
  | 'vercel-gateway';

interface GatewayPricingTier {
  cost: string;
  min: number;
  max?: number;
}

interface GatewayVideoDurationPricing {
  resolution?: string;
  cost_per_second: string;
  audio?: boolean;
  mode?: string;
}

interface GatewayModelPricing {
  // Vercel AI Gateway uses these field names (values are strings)
  input?: string;
  output?: string;
  input_cache_read?: string;
  input_cache_write?: string;
  web_search?: string;
  image?: string;
  input_tiers?: GatewayPricingTier[];
  output_tiers?: GatewayPricingTier[];
  input_cache_read_tiers?: GatewayPricingTier[];
  input_cache_write_tiers?: GatewayPricingTier[];
  video_duration_pricing?: GatewayVideoDurationPricing[];
}

interface GatewayModel {
  id: string;
  object: string;
  created: number;
  released?: number;
  owned_by: string;
  name: string;
  description?: string;
  context_window?: number;
  max_tokens?: number;
  type: 'language' | 'embedding' | 'image' | 'video' | string;
  tags?: string[];
  pricing?: GatewayModelPricing;
}

interface GatewayModelsResponse {
  object: string;
  data: GatewayModel[];
}

interface PublicGatewayModel {
  cache_read_price_per_token?: number | string | null;
  cache_write_price_per_token?: number | string | null;
  context_window?: number | null;
  description?: string | null;
  id: string;
  image_gen_price?: number | string | null;
  input_price_per_token?: number | string | null;
  input_tiers?: unknown;
  is_enabled?: boolean | null;
  max_tokens?: number | null;
  name?: string | null;
  output_price_per_token?: number | string | null;
  output_tiers?: unknown;
  pricing_raw?: unknown;
  provider?: string | null;
  released_at?: string | null;
  search_price?: number | string | null;
  synced_at?: string | null;
  tags?: string[] | null;
  type?: string | null;
  web_search_price?: number | string | null;
}

interface PublicModelsResponse {
  data?: PublicGatewayModel[];
  pagination?: {
    limit: number;
    page: number;
    total: number;
  };
}

interface SyncResult {
  synced: number;
  new: number;
  updated: number;
  errors: string[];
}

const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/models';
const TUTURUUU_PRODUCTION_PUBLIC_MODELS_URL =
  'https://tuturuuu.com/api/v1/infrastructure/ai/models';
const PUBLIC_MODELS_PAGE_SIZE = 100;
const UPSERT_BATCH_SIZE = 100;
const SELECT_BATCH_SIZE = 1000;

function isImageGenModelId(id: string): boolean {
  return (
    id.startsWith('google/imagen-') || id === 'google/gemini-2.5-flash-image'
  );
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchVercelGatewayModels(): Promise<GatewayModel[]> {
  const response = await fetch(GATEWAY_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch gateway models: ${response.status} ${response.statusText}`
    );
  }

  const json = (await response.json()) as unknown;

  return Array.isArray(json)
    ? (json as GatewayModel[])
    : ((json as GatewayModelsResponse | undefined)?.data ?? []);
}

async function fetchTuturuuuProductionPublicModels(): Promise<
  PublicGatewayModel[]
> {
  const models: PublicGatewayModel[] = [];

  for (let page = 1; page <= 100; page++) {
    const url = new URL(TUTURUUU_PRODUCTION_PUBLIC_MODELS_URL);
    url.searchParams.set('format', 'paginated');
    url.searchParams.set('limit', String(PUBLIC_MODELS_PAGE_SIZE));
    url.searchParams.set('page', String(page));
    url.searchParams.set('type', 'all');

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Tuturuuu production public models: ${response.status} ${response.statusText}`
      );
    }

    const json = (await response.json()) as
      | PublicGatewayModel[]
      | PublicModelsResponse;

    if (Array.isArray(json)) {
      return json;
    }

    const pageModels = Array.isArray(json.data) ? json.data : [];
    models.push(...pageModels);

    const total = json.pagination?.total;
    if (
      pageModels.length < PUBLIC_MODELS_PAGE_SIZE ||
      (typeof total === 'number' && models.length >= total)
    ) {
      break;
    }
  }

  return models;
}

async function fetchExistingModelIds(
  sbAdmin: SupabaseClient
): Promise<Set<string>> {
  const existingIdSet = new Set<string>();

  for (let from = 0; ; from += SELECT_BATCH_SIZE) {
    const { data, error } = await sbAdmin
      .from('ai_gateway_models')
      .select('id')
      .range(from, from + SELECT_BATCH_SIZE - 1);

    if (error) {
      throw new Error(
        `Failed to fetch existing gateway models: ${error.message}`
      );
    }

    for (const row of (data ?? []) as Array<{ id: string }>) {
      existingIdSet.add(row.id);
    }

    if (!data || data.length < SELECT_BATCH_SIZE) {
      break;
    }
  }

  return existingIdSet;
}

function mapVercelGatewayModel(m: GatewayModel) {
  const provider = m.owned_by || m.id.split('/')[0] || 'unknown';
  const modelName = m.id.split('/').slice(1).join('/') || m.id;

  return {
    id: m.id,
    name: m.name || modelName,
    provider,
    description: m.description || null,
    type: m.type || 'language',
    context_window: m.context_window ?? null,
    max_tokens: m.max_tokens ?? null,
    tags: m.tags ?? [],
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
    // Use gateway image price when present; fallback for known image models so credit deduction stays correct
    image_gen_price: m.pricing?.image
      ? parseFloat(m.pricing.image)
      : isImageGenModelId(m.id)
        ? 0.0001
        : null,
    released_at: m.released ? new Date(m.released * 1000).toISOString() : null,
    pricing_raw: m.pricing ?? null,
    synced_at: new Date().toISOString(),
  };
}

function mapTuturuuuProductionPublicModel(m: PublicGatewayModel) {
  const provider = m.provider || m.id.split('/')[0] || 'unknown';
  const modelName = m.id.split('/').slice(1).join('/') || m.id;

  return {
    id: m.id,
    name: m.name || modelName,
    provider,
    description: m.description ?? null,
    type: m.type || 'language',
    context_window: m.context_window ?? null,
    max_tokens: m.max_tokens ?? null,
    tags: m.tags ?? [],
    input_price_per_token: toNumber(m.input_price_per_token),
    output_price_per_token: toNumber(m.output_price_per_token),
    input_tiers: m.input_tiers ?? null,
    output_tiers: m.output_tiers ?? null,
    cache_read_price_per_token: toNullableNumber(m.cache_read_price_per_token),
    cache_write_price_per_token: toNullableNumber(
      m.cache_write_price_per_token
    ),
    web_search_price: toNullableNumber(m.web_search_price),
    image_gen_price:
      toNullableNumber(m.image_gen_price) ??
      (isImageGenModelId(m.id) ? 0.0001 : null),
    released_at: m.released_at ?? null,
    pricing_raw: m.pricing_raw ?? null,
    search_price: toNullableNumber(m.search_price),
    synced_at: new Date().toISOString(),
    ...(typeof m.is_enabled === 'boolean' ? { is_enabled: m.is_enabled } : {}),
  };
}

/**
 * Fetches model data from the selected catalog and upserts into ai_gateway_models.
 * Vercel Gateway sync preserves enablement; production-public sync mirrors it
 * when the public catalog includes is_enabled.
 */
export async function syncGatewayModels(
  sbAdmin: SupabaseClient,
  options: { source?: GatewayModelSyncSource } = {}
): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, new: 0, updated: 0, errors: [] };
  const source = options.source ?? 'vercel-gateway';

  const rows =
    source === 'tuturuuu-production-public'
      ? (await fetchTuturuuuProductionPublicModels()).map(
          mapTuturuuuProductionPublicModel
        )
      : (await fetchVercelGatewayModels()).map(mapVercelGatewayModel);

  if (rows.length === 0) {
    result.errors.push('No models returned from gateway');
    return result;
  }

  const existingIdSet = await fetchExistingModelIds(sbAdmin);

  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await sbAdmin
      .from('ai_gateway_models')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      result.errors.push(`Batch ${i / UPSERT_BATCH_SIZE}: ${error.message}`);
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
