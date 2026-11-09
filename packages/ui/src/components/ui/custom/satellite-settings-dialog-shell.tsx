'use client';

import { ArrowLeft, Compass, Search, X } from '@tuturuuu/icons';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@tuturuuu/ui/breadcrumb';
import { Button } from '@tuturuuu/ui/button';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useIsMobile } from '@tuturuuu/ui/hooks/use-mobile';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInput,
  SidebarProvider,
} from '@tuturuuu/ui/sidebar';
import type { ComponentType, KeyboardEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveSettingsTab } from '../../../hooks/settings-dialog-url';
import type { createSettingsSearchEngine } from './settings-dialog-search';
import { loadSettingsSearchEngine } from './settings-dialog-search-loader';
import { SettingsMobileNav } from './settings-mobile-nav';
import { SettingsSidebarGroup } from './settings-sidebar-group';

export interface SettingsNavItem {
  name: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  description?: string;
  hideContentHeader?: boolean;
  disabled?: boolean;
  keywords?: string[];
  aliases?: string[];
  searchLabels?: string[];
}

export interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

export interface SettingsDialogShellProps {
  t: (
    key:
      | 'common.close'
      | 'common.no_results_found'
      | 'common.settings'
      | 'onboarding_guide.description'
      | 'onboarding_guide.replay_app'
      | 'onboarding_guide.restart_journey'
      | 'onboarding_guide.title'
      | 'search.search'
      | 'settings.back_to_app'
      | 'settings.manage_settings'
      | 'settings.search_settings_placeholder',
    values?: Record<string, string | number>
  ) => string;
  persistedTab: string | null;
  setPersistedTab: (value: string) => void;
  onboardingPanel: ReactNode;
  /** Ordered list of navigation groups */
  navItems: SettingsNavGroup[];
  /** Currently active tab name */
  activeTab: string;
  /** Callback when active tab changes */
  onActiveTabChange: (tab: string) => void;
  /**
   * Group labels that should be expanded by default.
   * Used when expandAllAccordions is false.
   * If not provided in that mode, only the first group expands.
   */
  primaryGroupLabels?: string[];
  /** Override to expand all accordions (user preference). Defaults to expanded. */
  expandAllAccordions?: boolean;
  /** Enable dialog-scoped keyboard shortcuts for search and tab navigation */
  keyboardNavigation?: boolean;
  /** Optional context control that replaces the active group breadcrumb */
  activeGroupBreadcrumb?: ReactNode;
  /** Content to render in the main area */
  children: ReactNode;
}

type SettingsSearchEngine = ReturnType<typeof createSettingsSearchEngine>;
type SettingsSearchEngineFactory = typeof createSettingsSearchEngine;

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();

  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  );
}

/**
 * Shared settings dialog shell providing the layout framework.
 *
 * Each app provides its own `navItems` (ordered by priority) and
 * renders tab-specific content via `children`. The `primaryGroupLabels`
 * prop controls which groups expand when `expandAllAccordions` is false,
 * enabling apps to highlight their domain while preserving a compact mode.
 */
export function SatelliteSettingsDialogShell({
  t,
  persistedTab,
  setPersistedTab,
  onboardingPanel,
  navItems,
  activeTab,
  onActiveTabChange,
  primaryGroupLabels,
  expandAllAccordions = true,
  keyboardNavigation = false,
  activeGroupBreadcrumb,
  children,
}: SettingsDialogShellProps) {
  const isMobile = useIsMobile();
  const desktopSearchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const searchEngineLoadRef = useRef<Promise<void> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchEngineFactory, setSearchEngineFactory] =
    useState<SettingsSearchEngineFactory | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const extendedNavItems = useMemo<SettingsNavGroup[]>(
    () => [
      ...navItems,
      {
        label: t('onboarding_guide.title'),
        items: [
          {
            name: 'onboarding_guide',
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
    ],
    [navItems, t]
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
  const showContentHeader = !activeItem?.hideContentHeader;
  // Only the first group that owns the active tab marks it current, so a tab
  // name repeated in another group never renders a second highlight.
  const activeGroupLabel = activeGroup?.label;
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

  const isGroupExpandedByDefault = (groupLabel: string, index: number) => {
    if (expandAllAccordions || searchQuery) return true;
    if (primaryGroupLabels) return primaryGroupLabels.includes(groupLabel);
    return index === 0;
  };

  const focusSearch = useCallback(() => {
    if (isMobile) {
      setMobileNavOpen(true);
      ensureSearchEngine();
      requestAnimationFrame(() => {
        mobileSearchInputRef.current?.focus();
      });
      return;
    }

    ensureSearchEngine();
    desktopSearchInputRef.current?.focus();
  }, [ensureSearchEngine, isMobile]);

  const changeActiveItem = useCallback(
    (targetIndex: number) => {
      const targetItem = keyboardEnabledItems[targetIndex];
      if (targetItem) selectActiveTab(targetItem.name);
    },
    [keyboardEnabledItems, selectActiveTab]
  );

  const moveActiveItem = useCallback(
    (direction: 1 | -1) => {
      if (keyboardEnabledItems.length === 0) return;

      const currentIndex = keyboardEnabledItems.findIndex(
        (item) => item.name === activeTab
      );
      const nextIndex =
        currentIndex === -1
          ? direction === 1
            ? 0
            : keyboardEnabledItems.length - 1
          : (currentIndex + direction + keyboardEnabledItems.length) %
            keyboardEnabledItems.length;

      changeActiveItem(nextIndex);
    },
    [activeTab, changeActiveItem, keyboardEnabledItems]
  );

  const handleKeyboardNavigation = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!keyboardNavigation || event.defaultPrevented) return;

      const key = event.key.toLowerCase();
      const isModifierSearch =
        (event.metaKey || event.ctrlKey) && !event.altKey && key === 'f';
      const isSlashSearch =
        !event.metaKey && !event.ctrlKey && !event.altKey && event.key === '/';

      if (isModifierSearch || isSlashSearch) {
        if (isSlashSearch && isEditableShortcutTarget(event.target)) return;

        event.preventDefault();
        focusSearch();
        return;
      }

      if (
        !event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        isEditableShortcutTarget(event.target)
      ) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveActiveItem(1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveActiveItem(-1);
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        changeActiveItem(0);
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        changeActiveItem(keyboardEnabledItems.length - 1);
      }
    },
    [
      changeActiveItem,
      keyboardEnabledItems.length,
      focusSearch,
      keyboardNavigation,
      moveActiveItem,
    ]
  );

  return (
    <DialogContent
      presentation="fullscreen"
      className="settings-surface flex-col md:inset-8 md:h-auto md:max-h-none md:w-auto md:rounded-2xl md:border md:shadow-2xl"
      onKeyDown={handleKeyboardNavigation}
      showCloseButton={false}
    >
      <DialogTitle className="sr-only">{t('common.settings')}</DialogTitle>
      <DialogDescription className="sr-only">
        {t('common.settings')}
      </DialogDescription>
      <SidebarProvider className="flex h-full min-h-0 items-start">
        <Sidebar
          collapsible="none"
          className="hidden h-full w-64 shrink-0 flex-col border-r bg-muted/20 md:flex"
        >
          <SidebarHeader className="sticky top-0 z-10 gap-3 border-b bg-background p-4">
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-9 justify-start px-2 font-normal text-foreground/80"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('settings.back_to_app')}
              </Button>
            </DialogClose>
            <div className="relative">
              <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
              <SidebarInput
                ref={desktopSearchInputRef}
                placeholder={t('settings.search_settings_placeholder')}
                aria-label={t('settings.search_settings_placeholder')}
                className="h-9 bg-background pl-8.5"
                value={searchQuery}
                onChange={(e) => updateSearchQuery(e.target.value)}
                onFocus={ensureSearchEngine}
              />
            </div>
          </SidebarHeader>
          <SidebarContent
            role="navigation"
            aria-label={t('common.settings')}
            className="gap-5 overscroll-contain overflow-y-auto p-3"
          >
            {filteredNavItems.length === 0 && (
              <p
                role="status"
                className="px-2 py-4 text-muted-foreground text-sm"
              >
                {t('common.no_results_found')}
              </p>
            )}
            {filteredNavItems.map((group, index) => (
              <SettingsSidebarGroup
                activeTab={group.label === activeGroupLabel ? activeTab : ''}
                collapsible={!expandAllAccordions && !searchQuery}
                defaultOpen={isGroupExpandedByDefault(group.label, index)}
                group={group}
                key={group.label}
                onSelect={selectActiveTab}
              />
            ))}
          </SidebarContent>
        </Sidebar>
        <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-6">
            <div className="flex flex-1 items-center gap-2 md:flex-initial">
              {isMobile && (
                <SettingsMobileNav
                  activeGroup={activeGroup}
                  activeItem={activeItem}
                  activeTab={activeTab}
                  labels={{
                    noResults: t('common.no_results_found'),
                    searchPlaceholder: t(
                      'settings.search_settings_placeholder'
                    ),
                    title: t('common.settings'),
                    description: t('search.search'),
                  }}
                  navItems={filteredNavItems}
                  onOpenChange={setMobileNavOpen}
                  onSearchChange={updateSearchQuery}
                  onSearchFocus={ensureSearchEngine}
                  onSelect={selectActiveTab}
                  open={mobileNavOpen}
                  searchInputRef={mobileSearchInputRef}
                  searchQuery={searchQuery}
                />
              )}

              <Breadcrumb className="hidden md:flex">
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="#" className="pointer-events-none">
                      {t('common.settings')}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  {activeGroup && (
                    <>
                      <BreadcrumbItem data-testid="settings-active-group-breadcrumb">
                        {activeGroupBreadcrumb ?? (
                          <BreadcrumbPage className="text-muted-foreground">
                            {activeGroup.label}
                          </BreadcrumbPage>
                        )}
                      </BreadcrumbItem>
                      <BreadcrumbSeparator />
                    </>
                  )}
                  <BreadcrumbItem>
                    <BreadcrumbPage>{activeItem?.label}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto size-11 shrink-0 text-muted-foreground md:size-9"
              >
                <X
                  className="h-4 w-4"
                  data-testid="settings-mobile-close-icon"
                />
                <span className="sr-only">{t('common.close')}</span>
              </Button>
            </DialogClose>
          </header>
          <div className="flex min-h-0 flex-1 flex-col overscroll-contain overflow-y-auto px-4 py-6 md:px-10 md:py-10">
            <div className="mx-auto w-full max-w-3xl space-y-8">
              {showContentHeader && (
                <div className="space-y-1">
                  <h2 className="font-semibold text-2xl tracking-tight">
                    {activeItem?.label}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {activeItem?.description ||
                      t('settings.manage_settings', {
                        label: activeItem?.label?.toLowerCase() ?? '',
                      })}
                  </p>
                </div>
              )}
              {activeTab === 'onboarding_guide' ? onboardingPanel : children}
            </div>
          </div>
        </main>
      </SidebarProvider>
    </DialogContent>
  );
}
