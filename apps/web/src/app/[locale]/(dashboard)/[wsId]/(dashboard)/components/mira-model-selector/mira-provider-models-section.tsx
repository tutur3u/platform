'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import type { AIModelUI } from '@tuturuuu/types';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { useTranslations } from 'next-intl';
import {
  fetchGatewayModelsPage,
  MAX_PAGINATION_ITEMS,
  MIRA_GATEWAY_PROVIDER_MODELS_QUERY_KEY,
} from '../mira-gateway-models';
import { ProviderLogo } from '../provider-logo';
import { MiraModelList } from './mira-model-list';
import {
  formatProvider,
  getSortedProviderModels,
} from './mira-model-selector-utils';
import type {
  ModelAllowedFn,
  ModelFavoritedFn,
  ModelFavoriteToggleHandler,
} from './types';

interface MiraProviderModelsSectionProps {
  defaultModelId: string | null;
  enabled: boolean;
  hideLockedModels: boolean;
  isFavorited: ModelFavoritedFn;
  isModelAllowed: ModelAllowedFn;
  model: AIModelUI;
  onSelectModel: (model: AIModelUI) => void;
  onToggleFavorite: ModelFavoriteToggleHandler;
  pendingModelId: string | null;
  provider: string;
  search: string;
}

export function MiraProviderModelsSection({
  defaultModelId,
  enabled,
  hideLockedModels,
  isFavorited,
  isModelAllowed,
  model,
  onSelectModel,
  onToggleFavorite,
  pendingModelId,
  provider,
  search,
}: MiraProviderModelsSectionProps) {
  const t = useTranslations('dashboard.mira_chat');

  const providerModelsQuery = useInfiniteQuery({
    queryKey: [MIRA_GATEWAY_PROVIDER_MODELS_QUERY_KEY, { provider, search }],
    queryFn: ({ pageParam }) =>
      fetchGatewayModelsPage({
        limit: MAX_PAGINATION_ITEMS,
        offset: typeof pageParam === 'number' ? pageParam : 0,
        provider,
        search,
      }),
    enabled,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    staleTime: 5 * 60 * 1000,
  });

  const models = getSortedProviderModels(
    providerModelsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    {
      defaultModelId,
      hideLockedModels,
      isFavorited,
      isModelAllowed,
      search,
    }
  );

  return (
    <AccordionItem value={provider} className="w-full min-w-0 border-b-0">
      <AccordionTrigger
        className="w-full min-w-0 px-3 py-2 font-semibold text-muted-foreground text-xs hover:no-underline"
        showChevron={true}
      >
        <div className="flex items-center gap-2">
          <ProviderLogo provider={provider} size={14} className="shrink-0" />
          <span className="capitalize">{formatProvider(provider)}</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="w-full min-w-0 overflow-hidden pt-0 pb-2">
        {providerModelsQuery.isLoading ? (
          <div className="flex items-center justify-center px-3 py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="w-full min-w-0 px-3">
            <MiraModelList
              defaultModelId={defaultModelId}
              hasNextPage={providerModelsQuery.hasNextPage}
              isEmptyMessage={t('model_selector_empty')}
              isFavorited={isFavorited}
              isFetchingNextPage={providerModelsQuery.isFetchingNextPage}
              isModelAllowed={isModelAllowed}
              model={model}
              models={models}
              onLoadMore={() => {
                if (!providerModelsQuery.hasNextPage) return;
                void providerModelsQuery.fetchNextPage();
              }}
              onSelectModel={onSelectModel}
              onToggleFavorite={onToggleFavorite}
              pendingModelId={pendingModelId}
            />
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
