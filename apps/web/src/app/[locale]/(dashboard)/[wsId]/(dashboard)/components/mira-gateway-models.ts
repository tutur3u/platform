'use client';

import { matchesAllowedModel } from '@tuturuuu/ai/credits/model-mapping';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { AIModelUI } from '@tuturuuu/types';

export const MIRA_GATEWAY_MODELS_QUERY_KEY = ['ai-gateway-models', 'enabled'];
export const MIRA_GATEWAY_PROVIDERS_QUERY_KEY = ['ai-gateway-model-providers'];
export const MIRA_GATEWAY_PROVIDER_MODELS_QUERY_KEY = [
  'ai-gateway-models-by-provider',
];
export const MAX_PAGINATION_ITEMS = 5;

type GatewayModelRow = {
  context_window: number | null;
  description: string | null;
  id: string;
  input_price_per_token: number | null;
  is_enabled: boolean | null;
  max_tokens: number | null;
  name: string;
  output_price_per_token: number | null;
  provider: string;
  tags: string[] | null;
};

export type GatewayModelProviderSummary = {
  allowedCount: number;
  provider: string;
  total: number;
};

export type GatewayModelUi = AIModelUI & {
  inputPricePerToken?: number;
  maxTokens?: number;
  outputPricePerToken?: number;
};

type FetchGatewayProvidersOptions = {
  allowedModels?: string[];
  hideLockedModels?: boolean;
  search?: string;
};

type FetchGatewayModelsPageOptions = {
  limit?: number;
  offset?: number;
  provider: string;
  search?: string;
};

function applyGatewayModelSearch<
  T extends {
    ilike: (column: string, value: string) => T;
    or: (filters: string) => T;
  },
>(query: T, search?: string) {
  const trimmedSearch = search?.trim();
  if (!trimmedSearch) return query;

  const escapedSearch = trimmedSearch.replace(
    /[%_,]/g,
    (match) => `\\${match}`
  );
  const pattern = `%${escapedSearch}%`;

  return query.or(
    [
      `name.ilike.${pattern}`,
      `id.ilike.${pattern}`,
      `description.ilike.${pattern}`,
    ].join(',')
  );
}

function mapGatewayModel(model: GatewayModelRow): GatewayModelUi {
  const inputPricePerToken = Number(model.input_price_per_token ?? 0);
  const outputPricePerToken = Number(model.output_price_per_token ?? 0);

  return {
    context: model.context_window ?? undefined,
    description: model.description ?? undefined,
    disabled: !model.is_enabled,
    inputPricePerToken:
      Number.isFinite(inputPricePerToken) && inputPricePerToken > 0
        ? inputPricePerToken
        : undefined,
    label: model.name,
    maxTokens: model.max_tokens ?? undefined,
    outputPricePerToken:
      Number.isFinite(outputPricePerToken) && outputPricePerToken > 0
        ? outputPricePerToken
        : undefined,
    provider: model.provider,
    tags: model.tags ?? undefined,
    value: model.id,
  };
}

export function sortModelsForDisplay(
  models: AIModelUI[],
  {
    defaultModelId,
    isFavorited,
    isModelAllowed,
  }: {
    defaultModelId: string | null;
    isFavorited: (modelId: string) => boolean;
    isModelAllowed: (modelId: string) => boolean;
  }
): AIModelUI[] {
  return [...models].sort((a, b) => {
    const aAllowed = isModelAllowed(a.value);
    const bAllowed = isModelAllowed(b.value);

    if (aAllowed !== bAllowed) return aAllowed ? -1 : 1;

    const aDefault = a.value === defaultModelId;
    const bDefault = b.value === defaultModelId;
    if (aDefault !== bDefault) return aDefault ? -1 : 1;

    const aFav = isFavorited(a.value);
    const bFav = isFavorited(b.value);
    if (aFav !== bFav) return aFav ? -1 : 1;

    return a.label.localeCompare(b.label);
  });
}

export async function fetchGatewayProviders({
  allowedModels = [],
  hideLockedModels = false,
  search,
}: FetchGatewayProvidersOptions = {}): Promise<GatewayModelProviderSummary[]> {
  const supabase = createClient();
  let query = supabase
    .from('ai_gateway_models')
    .select('id, provider, is_enabled')
    .eq('type', 'language');

  query = applyGatewayModelSearch(query, search);

  const { data, error } = await query.order('provider').order('name');

  if (error || !data?.length) return [];

  const providerMap = new Map<string, GatewayModelProviderSummary>();

  for (const row of data) {
    const current = providerMap.get(row.provider) ?? {
      allowedCount: 0,
      provider: row.provider,
      total: 0,
    };

    current.total += 1;
    if (row.is_enabled && matchesAllowedModel(row.id, allowedModels)) {
      current.allowedCount += 1;
    }

    providerMap.set(row.provider, current);
  }

  const providers = Array.from(providerMap.values());
  if (!hideLockedModels) return providers;

  return providers.filter((provider) => provider.allowedCount > 0);
}

export async function fetchGatewayModelsPage({
  provider,
  offset = 0,
  limit = MAX_PAGINATION_ITEMS,
  search,
}: FetchGatewayModelsPageOptions): Promise<{
  items: GatewayModelUi[];
  nextOffset?: number;
}> {
  const supabase = createClient();
  let query = supabase
    .from('ai_gateway_models')
    .select(
      'id, name, provider, description, context_window, max_tokens, tags, is_enabled, input_price_per_token, output_price_per_token'
    )
    .eq('type', 'language')
    .eq('provider', provider);

  query = applyGatewayModelSearch(query, search);

  const { data, error } = await query
    .order('name')
    .range(offset, offset + limit - 1);

  if (error || !data?.length) {
    return { items: [], nextOffset: undefined };
  }

  const items = data.map((model) => mapGatewayModel(model as GatewayModelRow));

  return {
    items,
    nextOffset: items.length < limit ? undefined : offset + limit,
  };
}

export async function fetchGatewayFavoriteModels(
  wsId: string
): Promise<GatewayModelUi[]> {
  const supabase = createClient();
  const { data: favorites, error: favoritesError } = await supabase
    .from('ai_model_favorites')
    .select('model_id')
    .eq('ws_id', wsId);

  if (favoritesError || !favorites?.length) return [];

  const favoriteIds = favorites.map((favorite) => favorite.model_id);
  const { data, error } = await supabase
    .from('ai_gateway_models')
    .select(
      'id, name, provider, description, context_window, max_tokens, tags, is_enabled, input_price_per_token, output_price_per_token'
    )
    .in('id', favoriteIds)
    .eq('type', 'language');

  if (error || !data?.length) return [];

  return data.map((model) => mapGatewayModel(model as GatewayModelRow));
}

export async function fetchGatewayModels(): Promise<GatewayModelUi[]> {
  const providers = await fetchGatewayProviders();
  const pages = await Promise.all(
    providers.map((provider) =>
      fetchGatewayModelsPage({
        limit: Number.MAX_SAFE_INTEGER,
        provider: provider.provider,
      })
    )
  );

  return pages.flatMap((page) => page.items);
}

export function modelSupportsFileInput(model?: Pick<AIModelUI, 'tags'> | null) {
  return Array.isArray(model?.tags) && model.tags.includes('file-input');
}
