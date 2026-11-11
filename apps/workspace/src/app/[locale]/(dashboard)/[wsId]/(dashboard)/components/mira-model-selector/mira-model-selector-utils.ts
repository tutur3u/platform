import type { AIModelUI } from '@tuturuuu/types';
import {
  type GatewayModelProviderSummary,
  sortModelsForDisplay,
} from '../mira-gateway-models';
import type { ModelAllowedFn, ModelFavoritedFn } from './types';

export const EMPTY_PROVIDER_SUMMARIES: GatewayModelProviderSummary[] = [];

export function formatProvider(provider: string): string {
  return provider
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function modelMatchesSearch(model: AIModelUI, search: string): boolean {
  if (!search.trim()) return true;

  const query = search.toLowerCase().trim();

  return (
    model.label.toLowerCase().includes(query) ||
    model.provider.toLowerCase().includes(query) ||
    model.value.toLowerCase().includes(query) ||
    (model.description?.toLowerCase().includes(query) ?? false)
  );
}

export function filterVisibleModels<T extends AIModelUI>(
  models: T[],
  {
    hideLockedModels,
    isModelAllowed,
    search,
  }: {
    hideLockedModels: boolean;
    isModelAllowed: ModelAllowedFn;
    search: string;
  }
): T[] {
  const filteredByLocked = hideLockedModels
    ? models.filter((item) => isModelAllowed(item))
    : models;

  return filteredByLocked.filter((item) => modelMatchesSearch(item, search));
}

export function getSortedProviderModels<T extends AIModelUI>(
  models: T[],
  {
    defaultModelId,
    hideLockedModels,
    isFavorited,
    isModelAllowed,
    search,
  }: {
    defaultModelId: string | null;
    hideLockedModels: boolean;
    isFavorited: ModelFavoritedFn;
    isModelAllowed: ModelAllowedFn;
    search: string;
  }
): T[] {
  const visibleModels = filterVisibleModels(models, {
    hideLockedModels,
    isModelAllowed,
    search,
  });
  const modelsById = new Map(visibleModels.map((item) => [item.value, item]));

  return sortModelsForDisplay(visibleModels, {
    defaultModelId,
    isFavorited,
    isModelAllowed: (modelId) => {
      const providerModel = modelsById.get(modelId);
      return providerModel ? isModelAllowed(providerModel) : false;
    },
  });
}

export function getSortedFavoriteModels<T extends AIModelUI>(
  models: T[],
  {
    hideLockedModels,
    isModelAllowed,
    search,
  }: {
    hideLockedModels: boolean;
    isModelAllowed: ModelAllowedFn;
    search: string;
  }
): T[] {
  return [
    ...filterVisibleModels(models, {
      hideLockedModels,
      isModelAllowed,
      search,
    }),
  ].sort((a, b) => {
    const providerOrder = a.provider.localeCompare(b.provider);
    if (providerOrder !== 0) return providerOrder;
    return a.label.localeCompare(b.label);
  });
}
