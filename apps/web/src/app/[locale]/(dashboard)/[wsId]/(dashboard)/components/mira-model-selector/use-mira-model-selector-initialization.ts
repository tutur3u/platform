'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef } from 'react';

interface UseMiraModelSelectorInitializationParams {
  deferredOpen: boolean;
  favoritesLoading: boolean;
  hasFavorites: boolean;
  isAllModelsView: boolean;
  providerNames: string[];
  setExpandedProviders: Dispatch<SetStateAction<string[]>>;
  setFavoritesOnly: Dispatch<SetStateAction<boolean>>;
  setSelectedProvider: Dispatch<SetStateAction<string | null>>;
}

export function useMiraModelSelectorInitialization({
  deferredOpen,
  favoritesLoading,
  hasFavorites,
  isAllModelsView,
  providerNames,
  setExpandedProviders,
  setFavoritesOnly,
  setSelectedProvider,
}: UseMiraModelSelectorInitializationParams) {
  const hasAppliedInitialFavoritesView = useRef(false);
  const hasInitializedAllProviders = useRef(false);

  useEffect(() => {
    if (!deferredOpen) {
      hasAppliedInitialFavoritesView.current = false;
      hasInitializedAllProviders.current = false;
      return;
    }

    if (hasAppliedInitialFavoritesView.current || favoritesLoading) return;

    setFavoritesOnly(hasFavorites);
    hasAppliedInitialFavoritesView.current = true;
  }, [deferredOpen, favoritesLoading, hasFavorites, setFavoritesOnly]);

  useEffect(() => {
    if (!deferredOpen || !isAllModelsView || hasInitializedAllProviders.current)
      return;

    const firstProvider = providerNames[0];
    if (!firstProvider) return;

    setExpandedProviders([firstProvider]);
    hasInitializedAllProviders.current = true;
  }, [deferredOpen, isAllModelsView, providerNames, setExpandedProviders]);

  useEffect(() => {
    const validProviders = new Set(providerNames);

    setExpandedProviders((current) => {
      const next = current.filter((provider) => validProviders.has(provider));
      return next.length === current.length ? current : next;
    });

    setSelectedProvider((current) =>
      current && !validProviders.has(current) ? null : current
    );
  }, [providerNames, setExpandedProviders, setSelectedProvider]);
}
