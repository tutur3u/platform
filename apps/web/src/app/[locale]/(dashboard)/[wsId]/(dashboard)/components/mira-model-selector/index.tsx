'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { MiraModelSelectorContent } from './mira-model-selector-content';
import { MiraModelSelectorSidebar } from './mira-model-selector-sidebar';
import { MiraModelSelectorToolbar } from './mira-model-selector-toolbar';
import { MiraModelSelectorTriggerButton } from './mira-model-selector-trigger-button';
import type { MiraModelSelectorProps } from './types';
import { useMiraModelSelectorData } from './use-mira-model-selector-data';
import { useMiraModelSelectorInitialization } from './use-mira-model-selector-initialization';
import { useMiraModelSelectorViewState } from './use-mira-model-selector-view-state';

export default function MiraModelSelector({
  creditsWsId,
  disabled,
  hotkeySignal,
  model,
  onChange,
  shortcutLabel,
  wsId,
}: MiraModelSelectorProps) {
  const t = useTranslations('dashboard.mira_chat');

  const viewState = useMiraModelSelectorViewState({
    disabled,
    hotkeySignal,
  });

  const data = useMiraModelSelectorData({
    creditsWsId,
    deferredOpen: viewState.deferredOpen,
    favoritesOnly: viewState.favoritesOnly,
    hideLockedModels: viewState.hideLockedModels,
    search: viewState.search,
    selectedProvider: viewState.selectedProvider,
    wsId,
  });

  useMiraModelSelectorInitialization({
    deferredOpen: viewState.deferredOpen,
    favoritesLoading: data.favoritesLoading,
    hasFavorites: data.hasFavorites,
    isAllModelsView: viewState.isAllModelsView,
    providerNames: data.providerNames,
    setExpandedProviders: viewState.actions.setExpandedProviders,
    setFavoritesOnly: viewState.actions.setFavoritesOnly,
    setSelectedProvider: viewState.actions.setSelectedProvider,
  });

  const selectModel = useCallback(
    (nextModel: typeof model) => {
      onChange(nextModel);
      viewState.actions.onOpenChange(false);
    },
    [onChange, viewState.actions]
  );

  return (
    <Popover
      open={viewState.open}
      onOpenChange={viewState.actions.onOpenChange}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <MiraModelSelectorTriggerButton
              defaultModelId={data.defaultModelId}
              disabled={disabled}
              model={model}
              modelDefaultBadgeLabel={t('model_default_badge')}
            />
          </PopoverTrigger>
        </TooltipTrigger>
        {shortcutLabel ? (
          <TooltipContent>{`${t('model_picker')} (${shortcutLabel})`}</TooltipContent>
        ) : null}
      </Tooltip>

      <PopoverContent
        className="flex h-[min(480px,85vh)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden p-0"
        align="start"
        sideOffset={4}
      >
        <TooltipProvider delayDuration={200}>
          <MiraModelSelectorToolbar
            hideLockedModels={viewState.hideLockedModels}
            onHideLockedModelsChange={viewState.actions.setHideLockedModels}
            onSearchChange={viewState.actions.onSearchChange}
            search={viewState.search}
            showUpgradeCta={data.showUpgradeCta}
            wsId={wsId}
          />

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <MiraModelSelectorSidebar
              favoritesOnly={viewState.favoritesOnly}
              onToggleProvider={viewState.actions.onToggleProvider}
              onToggleShowAll={() =>
                viewState.actions.onToggleShowAll(data.providerNames)
              }
              onToggleShowFavorites={viewState.actions.onToggleShowFavorites}
              providerNames={data.providerNames}
              selectedProvider={viewState.selectedProvider}
            />

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <MiraModelSelectorContent
                defaultModelId={data.defaultModelId}
                expandedProviders={viewState.expandedProviders}
                favoriteModels={data.favoriteModels}
                favoritesOnly={viewState.favoritesOnly}
                hideLockedModels={viewState.hideLockedModels}
                isFavorited={data.isFavorited}
                isLoading={data.isLoadingRootPane}
                isModelAllowed={data.isModelAllowed}
                isSingleProviderView={viewState.isSingleProviderView}
                model={model}
                onExpandedProvidersChange={
                  viewState.actions.onExpandedProvidersChange
                }
                onSelectModel={selectModel}
                onToggleFavorite={data.handleToggleFavorite}
                pendingModelId={data.pendingModelId}
                providerNames={data.providerNames}
                search={viewState.search}
                selectedProvider={viewState.selectedProvider}
                selectedProviderModels={data.selectedProviderModels}
                selectedProviderModelsHasNextPage={
                  data.selectedProviderModelsQuery.hasNextPage
                }
                selectedProviderModelsIsFetchingNextPage={
                  data.selectedProviderModelsQuery.isFetchingNextPage
                }
                selectedProviderModelsLoadMore={() => {
                  if (!data.selectedProviderModelsQuery.hasNextPage) return;
                  void data.selectedProviderModelsQuery.fetchNextPage();
                }}
              />
            </div>
          </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
}
