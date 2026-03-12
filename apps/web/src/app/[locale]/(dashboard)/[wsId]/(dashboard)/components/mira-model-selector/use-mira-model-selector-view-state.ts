'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';

interface UseMiraModelSelectorViewStateParams {
  disabled?: boolean;
  hotkeySignal?: number;
}

export function useMiraModelSelectorViewState({
  disabled,
  hotkeySignal,
}: UseMiraModelSelectorViewStateParams) {
  const [open, setOpen] = useState(false);
  const [hideLockedModels, setHideLockedModels] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedProviders, setExpandedProviders] = useState<string[]>([]);
  const deferredOpen = useDeferredValue(open);

  const isAllModelsView = !favoritesOnly && !selectedProvider;
  const isSingleProviderView = !favoritesOnly && !!selectedProvider;

  useEffect(() => {
    if (!hotkeySignal || disabled) return;
    setOpen(true);
  }, [disabled, hotkeySignal]);

  const actions = useMemo(
    () => ({
      onExpandedProvidersChange: (value: string[]) =>
        setExpandedProviders(value),
      onOpenChange: setOpen,
      onSearchChange: setSearch,
      onToggleProvider: (provider: string) => {
        setSelectedProvider((current) => {
          const nextProvider = current === provider ? null : provider;
          if (nextProvider) {
            setFavoritesOnly(false);
          }
          return nextProvider;
        });
      },
      onToggleShowFavorites: () => {
        setFavoritesOnly((current) => !current);
        setSelectedProvider(null);
      },
      onToggleShowAll: (providerNames: string[]) => {
        setFavoritesOnly(false);
        setSelectedProvider(null);

        const firstProvider = providerNames[0];
        if (firstProvider) {
          setExpandedProviders([firstProvider]);
        }
      },
      setExpandedProviders,
      setFavoritesOnly,
      setHideLockedModels,
      setSelectedProvider,
    }),
    []
  );

  return {
    actions,
    deferredOpen,
    expandedProviders,
    favoritesOnly,
    hideLockedModels,
    isAllModelsView,
    isSingleProviderView,
    open,
    search,
    selectedProvider,
  };
}
