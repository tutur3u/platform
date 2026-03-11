'use client';

import { Loader2 } from '@tuturuuu/icons';
import type { AIModelUI } from '@tuturuuu/types';
import { Accordion } from '@tuturuuu/ui/accordion';
import { Command, CommandList } from '@tuturuuu/ui/command';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useTranslations } from 'next-intl';
import { ProviderLogo } from '../provider-logo';
import { MiraModelList } from './mira-model-list';
import { formatProvider } from './mira-model-selector-utils';
import { MiraProviderModelsSection } from './mira-provider-models-section';
import type {
  ModelAllowedFn,
  ModelFavoritedFn,
  ModelFavoriteToggleHandler,
} from './types';

interface MiraModelSelectorContentProps {
  defaultModelId: string | null;
  expandedProviders: string[];
  favoriteModels: AIModelUI[];
  favoritesOnly: boolean;
  hideLockedModels: boolean;
  isFavorited: ModelFavoritedFn;
  isLoading: boolean;
  isModelAllowed: ModelAllowedFn;
  isSingleProviderView: boolean;
  model: AIModelUI;
  onExpandedProvidersChange: (providers: string[]) => void;
  onSelectModel: (model: AIModelUI) => void;
  onToggleFavorite: ModelFavoriteToggleHandler;
  pendingModelId: string | null;
  providerNames: string[];
  search: string;
  selectedProvider: string | null;
  selectedProviderModels: AIModelUI[];
  selectedProviderModelsHasNextPage?: boolean;
  selectedProviderModelsIsFetchingNextPage?: boolean;
  selectedProviderModelsLoadMore: () => void;
}

export function MiraModelSelectorContent({
  defaultModelId,
  expandedProviders,
  favoriteModels,
  favoritesOnly,
  hideLockedModels,
  isFavorited,
  isLoading,
  isModelAllowed,
  isSingleProviderView,
  model,
  onExpandedProvidersChange,
  onSelectModel,
  onToggleFavorite,
  pendingModelId,
  providerNames,
  search,
  selectedProvider,
  selectedProviderModels,
  selectedProviderModelsHasNextPage,
  selectedProviderModelsIsFetchingNextPage,
  selectedProviderModelsLoadMore,
}: MiraModelSelectorContentProps) {
  const t = useTranslations('dashboard.mira_chat');

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center py-12">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (favoritesOnly) {
    return (
      <Command className="flex min-h-0 flex-1 flex-col" shouldFilter={false}>
        <CommandList className="flex min-h-0 flex-1 flex-col border-0 px-3 py-2">
          <MiraModelList
            defaultModelId={defaultModelId}
            fillHeight={true}
            isEmptyMessage={t('model_selector_empty')}
            isFavorited={isFavorited}
            isModelAllowed={isModelAllowed}
            model={model}
            models={favoriteModels}
            onSelectModel={onSelectModel}
            onToggleFavorite={onToggleFavorite}
            pendingModelId={pendingModelId}
          />
        </CommandList>
      </Command>
    );
  }

  if (isSingleProviderView && selectedProvider) {
    return (
      <Command className="flex min-h-0 flex-1 flex-col" shouldFilter={false}>
        <div className="w-full shrink-0 border-b px-3 py-2 font-semibold text-muted-foreground text-xs">
          <div className="flex items-center gap-2">
            <ProviderLogo
              provider={selectedProvider}
              size={14}
              className="shrink-0"
            />
            <span className="capitalize">
              {formatProvider(selectedProvider)}
            </span>
          </div>
        </div>
        <CommandList className="flex min-h-0 flex-1 flex-col border-0 px-3 py-2">
          <MiraModelList
            defaultModelId={defaultModelId}
            fillHeight={true}
            hasNextPage={selectedProviderModelsHasNextPage}
            isEmptyMessage={t('model_selector_empty')}
            isFavorited={isFavorited}
            isFetchingNextPage={selectedProviderModelsIsFetchingNextPage}
            isModelAllowed={isModelAllowed}
            model={model}
            models={selectedProviderModels}
            onLoadMore={selectedProviderModelsLoadMore}
            onSelectModel={onSelectModel}
            onToggleFavorite={onToggleFavorite}
            pendingModelId={pendingModelId}
          />
        </CommandList>
      </Command>
    );
  }

  if (providerNames.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        {t('model_selector_empty')}
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <Command shouldFilter={false}>
        <CommandList className="max-h-none w-full border-0 px-0 py-0">
          <Accordion
            type="multiple"
            value={expandedProviders}
            onValueChange={(value) =>
              onExpandedProvidersChange(Array.isArray(value) ? value : [])
            }
            className="w-full min-w-0"
          >
            {providerNames.map((provider) => (
              <MiraProviderModelsSection
                key={provider}
                defaultModelId={defaultModelId}
                enabled={expandedProviders.includes(provider)}
                hideLockedModels={hideLockedModels}
                isFavorited={isFavorited}
                isModelAllowed={isModelAllowed}
                model={model}
                onSelectModel={onSelectModel}
                onToggleFavorite={onToggleFavorite}
                pendingModelId={pendingModelId}
                provider={provider}
                search={search}
              />
            ))}
          </Accordion>
        </CommandList>
      </Command>
    </ScrollArea>
  );
}
