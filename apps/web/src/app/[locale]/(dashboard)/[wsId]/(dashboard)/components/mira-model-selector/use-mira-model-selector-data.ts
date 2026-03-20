'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { matchesAllowedModel } from '@tuturuuu/ai/credits/model-mapping';
import {
  listWorkspaceAiModelFavorites,
  toggleWorkspaceAiModelFavorite,
} from '@tuturuuu/internal-api/ai';
import type { AIModelUI } from '@tuturuuu/types';
import { useAiCredits } from '@tuturuuu/ui/hooks/use-ai-credits';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import {
  fetchGatewayFavoriteModels,
  fetchGatewayModelsPage,
  fetchGatewayProviders,
  MAX_PAGINATION_ITEMS,
  MIRA_GATEWAY_PROVIDER_MODELS_QUERY_KEY,
  MIRA_GATEWAY_PROVIDERS_QUERY_KEY,
} from '../mira-gateway-models';
import {
  EMPTY_PROVIDER_SUMMARIES,
  getSortedFavoriteModels,
  getSortedProviderModels,
} from './mira-model-selector-utils';
import type { ModelFavoriteToggleHandler } from './types';
import { useSortedProviderList } from './use-provider-logo-availability';

async function fetchFavorites(wsId: string): Promise<Set<string>> {
  const favoriteIds = await listWorkspaceAiModelFavorites(wsId);
  return new Set(favoriteIds);
}

async function toggleFavorite(
  wsId: string,
  modelId: string,
  isFavorited: boolean
): Promise<void> {
  await toggleWorkspaceAiModelFavorite(wsId, { modelId, isFavorited });
}

interface UseMiraModelSelectorDataParams {
  creditsWsId?: string;
  deferredOpen: boolean;
  favoritesOnly: boolean;
  hideLockedModels: boolean;
  search: string;
  selectedProvider: string | null;
  wsId: string;
}

export function useMiraModelSelectorData({
  creditsWsId,
  deferredOpen,
  favoritesOnly,
  hideLockedModels,
  search,
  selectedProvider,
  wsId,
}: UseMiraModelSelectorDataParams) {
  const t = useTranslations('dashboard.mira_chat');
  const queryClient = useQueryClient();
  const [pendingModelId, setPendingModelId] = useState<string | null>(null);

  const { data: favoriteIds, isLoading: favoritesLoading } = useQuery({
    queryKey: ['ai-model-favorites', wsId],
    queryFn: () => fetchFavorites(wsId),
    enabled: !!wsId,
    staleTime: 60 * 1000,
  });

  const { data: credits } = useAiCredits(creditsWsId ?? wsId);
  const defaultModelId = credits?.defaultLanguageModel ?? null;
  const allowedModels = credits?.allowedModels ?? [];
  const showUpgradeCta = credits?.tier === 'FREE';
  const hasFavorites =
    !favoritesLoading && !!favoriteIds && favoriteIds.size > 0;

  const isFavorited = useCallback(
    (modelId: string) => (favoriteIds ?? new Set<string>()).has(modelId),
    [favoriteIds]
  );

  const isModelAllowed = useCallback(
    (candidateModel: AIModelUI) => {
      if (candidateModel.disabled) return false;
      return matchesAllowedModel(candidateModel.value, allowedModels);
    },
    [allowedModels]
  );

  const providerSummariesQuery = useQuery({
    queryKey: [
      MIRA_GATEWAY_PROVIDERS_QUERY_KEY,
      { allowedModels, hideLockedModels },
    ],
    queryFn: () =>
      fetchGatewayProviders({
        allowedModels,
        hideLockedModels,
      }),
    enabled: deferredOpen,
    staleTime: 5 * 60 * 1000,
  });

  const providerList = useSortedProviderList(
    providerSummariesQuery.data ?? EMPTY_PROVIDER_SUMMARIES
  );
  const providerNames = useMemo(
    () => providerList.map((provider) => provider.provider),
    [providerList]
  );

  const favoriteModelsQuery = useQuery({
    queryKey: ['ai-model-favorites-models', wsId],
    queryFn: () => fetchGatewayFavoriteModels(wsId),
    enabled: deferredOpen && favoritesOnly && !!wsId,
    staleTime: 60 * 1000,
  });

  const selectedProviderModelsQuery = useInfiniteQuery({
    queryKey: [
      MIRA_GATEWAY_PROVIDER_MODELS_QUERY_KEY,
      { provider: selectedProvider, search },
    ],
    queryFn: ({ pageParam }) =>
      fetchGatewayModelsPage({
        limit: MAX_PAGINATION_ITEMS,
        offset: typeof pageParam === 'number' ? pageParam : 0,
        provider: selectedProvider ?? '',
        search,
      }),
    enabled: deferredOpen && !!selectedProvider && !favoritesOnly,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    staleTime: 5 * 60 * 1000,
  });

  const favoriteModels = useMemo(
    () =>
      getSortedFavoriteModels(favoriteModelsQuery.data ?? [], {
        hideLockedModels,
        isModelAllowed,
        search,
      }),
    [favoriteModelsQuery.data, hideLockedModels, isModelAllowed, search]
  );

  const selectedProviderModels = useMemo(
    () =>
      getSortedProviderModels(
        selectedProviderModelsQuery.data?.pages.flatMap((page) => page.items) ??
          [],
        {
          defaultModelId,
          hideLockedModels,
          isFavorited,
          isModelAllowed,
          search,
        }
      ),
    [
      defaultModelId,
      hideLockedModels,
      isFavorited,
      isModelAllowed,
      search,
      selectedProviderModelsQuery.data,
    ]
  );

  const toggleFavoriteMutation = useMutation({
    mutationFn: ({
      isFavorited,
      modelId,
    }: {
      isFavorited: boolean;
      modelId: string;
      modelLabel: string;
    }) => toggleFavorite(wsId, modelId, isFavorited),
    onSuccess: (_, { modelLabel, isFavorited }) => {
      void queryClient.invalidateQueries({
        queryKey: ['ai-model-favorites', wsId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['ai-model-favorites-models', wsId],
      });

      const message = isFavorited
        ? t('model_removed_from_favorites', { model: modelLabel })
        : t('model_added_to_favorites', { model: modelLabel });
      toast.success(message);
    },
    onError: (error, { isFavorited, modelId, modelLabel }) => {
      void queryClient.invalidateQueries({
        queryKey: ['ai-model-favorites', wsId],
      });

      const action = isFavorited ? t('model_unfavorite') : t('model_favorite');
      const fallbackMessage = `${t('error')} (${action}: ${modelLabel} - ${modelId})`;
      const details = error instanceof Error ? error.message : '';
      toast.error(details ? `${fallbackMessage}: ${details}` : fallbackMessage);
    },
  });

  const handleToggleFavorite = useCallback<ModelFavoriteToggleHandler>(
    (event, modelId, modelLabel) => {
      event.stopPropagation();

      const favorited = isFavorited(modelId);
      setPendingModelId(modelId);

      toggleFavoriteMutation.mutate(
        {
          isFavorited: favorited,
          modelId,
          modelLabel,
        },
        {
          onSettled: () => setPendingModelId(null),
        }
      );
    },
    [isFavorited, toggleFavoriteMutation]
  );

  const isLoadingRootPane =
    !deferredOpen ||
    providerSummariesQuery.isLoading ||
    (favoritesOnly && favoriteModelsQuery.isLoading) ||
    (!!selectedProvider &&
      !favoritesOnly &&
      selectedProviderModelsQuery.isLoading);

  return {
    defaultModelId,
    favoriteModels,
    favoritesLoading,
    handleToggleFavorite,
    hasFavorites,
    isFavorited,
    isLoadingRootPane,
    isModelAllowed,
    pendingModelId,
    providerNames,
    selectedProviderModels,
    selectedProviderModelsQuery,
    showUpgradeCta,
  };
}
