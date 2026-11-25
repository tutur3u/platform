'use client';

import { Compass } from '@tuturuuu/icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  resolveSettingsTab,
  SHARED_SETTINGS_TAB_IDS,
} from '../../../hooks/settings-dialog-url';
import type {
  SettingsDialogShellProps,
  SettingsNavGroup,
} from './satellite-settings-dialog-shell';
import type { createSettingsSearchEngine } from './settings-dialog-search';
import { loadSettingsSearchEngine } from './settings-dialog-search-loader';

type SettingsSearchEngine = ReturnType<typeof createSettingsSearchEngine>;
type SettingsSearchEngineFactory = typeof createSettingsSearchEngine;

type NavigationOptions = Pick<
  SettingsDialogShellProps,
  | 'activeTab'
  | 'navItems'
  | 'onActiveTabChange'
  | 'persistedTab'
  | 'setPersistedTab'
  | 'showOnboardingGuide'
  | 't'
>;

/**
 * Tab, search and persistence state of the settings dialog. The onboarding
 * guide is appended as the last group, the search engine loads on first use,
 * and unknown or stale tabs fall back to the first enabled tab.
 */
export function useSettingsDialogNavigation({
  activeTab,
  navItems,
  onActiveTabChange,
  persistedTab,
  setPersistedTab,
  showOnboardingGuide = true,
  t,
}: NavigationOptions) {
  const searchEngineLoadRef = useRef<Promise<void> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchEngineFactory, setSearchEngineFactory] =
    useState<SettingsSearchEngineFactory | null>(null);

  const extendedNavItems = useMemo<SettingsNavGroup[]>(
    () =>
      showOnboardingGuide
        ? [
            ...navItems,
            {
              label: t('onboarding_guide.title'),
              items: [
                {
                  name: SHARED_SETTINGS_TAB_IDS.onboardingGuide,
                  label: t('onboarding_guide.title'),
                  description: t('onboarding_guide.description'),
                  icon: Compass,
                  keywords: [
                    t('onboarding_guide.replay_app'),
                    t('onboarding_guide.restart_journey'),
                  ],
                },
              ],
            },
          ]
        : navItems,
    [navItems, showOnboardingGuide, t]
  );

  const searchEngine = useMemo<SettingsSearchEngine | null>(
    () => searchEngineFactory?.(extendedNavItems) ?? null,
    [extendedNavItems, searchEngineFactory]
  );

  const allNavItems = useMemo(
    () =>
      searchEngine?.allItems ??
      extendedNavItems.flatMap((group) => group.items),
    [extendedNavItems, searchEngine]
  );

  const activeGroup = extendedNavItems.find((group) =>
    group.items.some((item) => item.name === activeTab)
  );

  const activeItem =
    allNavItems.find((item) => item.name === activeTab) ||
    allNavItems.find((item) => !item.disabled) ||
    allNavItems[0];
  const persistedItem = allNavItems.find(
    (item) => !item.disabled && item.name === persistedTab
  );

  useEffect(() => {
    if (persistedItem && persistedItem.name !== activeTab) {
      onActiveTabChange(persistedItem.name);
    }
  }, [activeTab, onActiveTabChange, persistedItem]);

  // Unknown tabs (stale or mistyped deep links) fall back to the first enabled
  // tab. The URL is left untouched so a tab that registers later still wins.
  const activeTabIsKnown = allNavItems.some((item) => item.name === activeTab);
  const fallbackTab = resolveSettingsTab(
    null,
    allNavItems
      .filter((item) => !item.disabled && item.name !== 'onboarding_guide')
      .map((item) => item.name)
  );
  useEffect(() => {
    if (activeTabIsKnown || persistedItem || !fallbackTab) return;
    onActiveTabChange(fallbackTab);
  }, [activeTabIsKnown, fallbackTab, onActiveTabChange, persistedItem]);

  const selectActiveTab = useCallback(
    (tab: string) => {
      onActiveTabChange(tab);
      void setPersistedTab(tab);
    },
    [onActiveTabChange, setPersistedTab]
  );

  const ensureSearchEngine = useCallback(() => {
    if (searchEngineFactory || searchEngineLoadRef.current) return;

    searchEngineLoadRef.current = loadSettingsSearchEngine()
      .then((module) => {
        setSearchEngineFactory(() => module.createSettingsSearchEngine);
      })
      .finally(() => {
        searchEngineLoadRef.current = null;
      });
  }, [searchEngineFactory]);

  const filteredNavItems = useMemo(
    () =>
      searchQuery
        ? (searchEngine?.search(searchQuery) ?? extendedNavItems)
        : extendedNavItems,
    [extendedNavItems, searchEngine, searchQuery]
  );

  const filteredEnabledItems = useMemo(
    () =>
      searchEngine?.getEnabledItems(searchQuery) ??
      filteredNavItems.flatMap((group) =>
        group.items.filter((item) => !item.disabled)
      ),
    [filteredNavItems, searchEngine, searchQuery]
  );
  const keyboardEnabledItems = useMemo(
    () =>
      filteredEnabledItems.filter((item) => item.name !== 'onboarding_guide'),
    [filteredEnabledItems]
  );

  const updateSearchQuery = useCallback(
    (value: string) => {
      if (value) ensureSearchEngine();
      setSearchQuery(value);
    },
    [ensureSearchEngine]
  );

  return {
    activeGroup,
    activeItem,
    ensureSearchEngine,
    filteredNavItems,
    keyboardEnabledItems,
    searchQuery,
    selectActiveTab,
    updateSearchQuery,
  };
}
