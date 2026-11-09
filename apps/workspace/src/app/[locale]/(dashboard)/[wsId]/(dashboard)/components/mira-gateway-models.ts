'use client';

import { matchesAllowedModel } from '@tuturuuu/ai/credits/model-mapping';
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

type GatewayModelsPageResponse = {
  data: GatewayModelRow[];
  pagination: {
    limit: number;
    page: number;
    total: number;
  };
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

async function fetchGatewayModelPage({
  ids,
  limit = 100,
  page = 1,
  provider,
  search,
}: {
  ids?: string[];
  limit?: number;
  page?: number;
  provider?: string;
  search?: string;
}): Promise<GatewayModelsPageResponse> {
  const params = new URLSearchParams({
    enabled: 'true',
    format: 'paginated',
    limit: String(limit),
    page: String(page),
    type: 'language',
  });

  if (provider) params.set('provider', provider);
  if (search) params.set('q', search);
  if (ids?.length) params.set('ids', ids.join(','));

  const response = await fetch(`/api/v1/infrastructure/ai/models?${params}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch AI gateway models');
  }

  return (await response.json()) as GatewayModelsPageResponse;
}

async function fetchGatewayModelCatalog(
  options: { ids?: string[]; search?: string } = {}
): Promise<GatewayModelUi[]> {
  const models: GatewayModelUi[] = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await fetchGatewayModelPage({
      ids: options.ids,
      page,
      search: options.search,
    });
    models.push(...response.data.map((model) => mapGatewayModel(model)));

    const loaded = response.pagination.page * response.pagination.limit;
    hasNextPage = loaded < response.pagination.total;
    page += 1;
  }

  return models;
}

export function sortModelsForDisplay<T extends AIModelUI>(
  models: T[],
  {
    defaultModelId,
    isFavorited,
    isModelAllowed,
  }: {
    defaultModelId: string | null;
    isFavorited: (modelId: string) => boolean;
    isModelAllowed: (modelId: string) => boolean;
  }
): T[] {
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
  const data = await fetchGatewayModelCatalog({ search });

  if (data.length === 0) return [];

  const providerMap = new Map<string, GatewayModelProviderSummary>();

  for (const row of data) {
    const current = providerMap.get(row.provider) ?? {
      allowedCount: 0,
      provider: row.provider,
      total: 0,
    };

    current.total += 1;
    if (!row.disabled && matchesAllowedModel(row.value, allowedModels)) {
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
  const page = Math.floor(offset / limit) + 1;
  const response = await fetchGatewayModelPage({
    limit,
    page,
    provider,
    search,
  });
  const items = response.data.map((model) => mapGatewayModel(model));
  const nextOffset = offset + items.length;

  if (items.length === 0) {
    return { items: [], nextOffset: undefined };
  }

  return {
    items,
    nextOffset: nextOffset < response.pagination.total ? nextOffset : undefined,
  };
}

export async function fetchGatewayFavoriteModels(
  wsId: string
): Promise<GatewayModelUi[]> {
  const response = await fetch(
    `/api/v1/workspaces/${wsId}/ai/model-favorites`,
    {
      cache: 'no-store',
    }
  );

  if (!response.ok) return [];

  const { favoriteIds = [] } = (await response.json()) as {
    favoriteIds?: string[];
  };
  if (favoriteIds.length === 0) return [];

  return fetchGatewayModelCatalog({ ids: favoriteIds });
}

export async function fetchGatewayModels(): Promise<GatewayModelUi[]> {
  return fetchGatewayModelCatalog();
}

export function modelSupportsFileInput(model?: Pick<AIModelUI, 'tags'> | null) {
  return Array.isArray(model?.tags) && model.tags.includes('file-input');
}
