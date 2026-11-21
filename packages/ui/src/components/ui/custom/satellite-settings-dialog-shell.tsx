'use client';

import { ArrowLeft, Search } from '@tuturuuu/icons';
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
import type { ComponentType, ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';
import { SettingsDialogHeader } from './settings-dialog-header';
import { SettingsMobileNav } from './settings-mobile-nav';
import { SettingsPageHeading } from './settings-section';
import { SettingsSidebarGroup } from './settings-sidebar-group';
import { useSettingsDialogKeyboard } from './use-settings-dialog-keyboard';
import { useSettingsDialogNavigation } from './use-settings-dialog-navigation';

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
  /** Enable dialog-scoped keyboard shortcuts for search and tab navigation */
  keyboardNavigation?: boolean;
  /** Optional context control that replaces the active group breadcrumb */
  activeGroupBreadcrumb?: ReactNode;
  /** Content to render in the main area */
  children: ReactNode;
}

/**
 * Shared settings dialog shell providing the layout framework.
 *
 * Each app provides its own `navItems` (ordered by priority) and renders
 * tab-specific content via `children`. Navigation groups are fixed labels
 * that always show their tabs, so every tab stays one click away.
 */
export function SatelliteSettingsDialogShell({
  t,
  persistedTab,
  setPersistedTab,
  onboardingPanel,
  navItems,
  activeTab,
  onActiveTabChange,
  keyboardNavigation = false,
  activeGroupBreadcrumb,
  children,
}: SettingsDialogShellProps) {
  const isMobile = useIsMobile();
  const desktopSearchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const {
    activeGroup,
    activeItem,
    ensureSearchEngine,
    filteredNavItems,
    keyboardEnabledItems,
    searchQuery,
    selectActiveTab,
    updateSearchQuery,
  } = useSettingsDialogNavigation({
    activeTab,
    navItems,
    onActiveTabChange,
    persistedTab,
    setPersistedTab,
    t,
  });
  const showContentHeader = !activeItem?.hideContentHeader;
  const pageHeading =
    showContentHeader && activeItem
      ? {
          title: activeItem.label,
          description:
            activeItem.description ||
            t('settings.manage_settings', {
              label: activeItem.label.toLowerCase(),
            }),
        }
      : null;
  // Only the first group that owns the active tab marks it current, so a tab
  // name repeated in another group never renders a second highlight.
  const activeGroupLabel = activeGroup?.label;

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

  const handleKeyboardNavigation = useSettingsDialogKeyboard({
    activeTab,
    enabled: keyboardNavigation,
    focusSearch,
    items: keyboardEnabledItems,
    selectTab: selectActiveTab,
  });

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
          data-settings-pane="nav"
          className="hidden h-full w-64 shrink-0 flex-col border-r bg-muted/20 md:flex"
        >
          <SidebarHeader
            data-settings-pane="nav-header"
            className="sticky top-0 z-10 gap-3 border-b bg-background p-4"
          >
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
            {filteredNavItems.map((group) => (
              <SettingsSidebarGroup
                activeTab={group.label === activeGroupLabel ? activeTab : ''}
                group={group}
                key={group.label}
                onSelect={selectActiveTab}
              />
            ))}
          </SidebarContent>
        </Sidebar>
        <main
          data-settings-pane="main"
          className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background"
        >
          <SettingsDialogHeader
            activeGroup={activeGroup}
            activeGroupBreadcrumb={activeGroupBreadcrumb}
            activeItem={activeItem}
            closeLabel={t('common.close')}
            mobileNav={
              isMobile && (
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
              )
            }
            settingsLabel={t('common.settings')}
          />
          <div className="flex min-h-0 flex-1 flex-col overscroll-contain overflow-y-auto px-4 py-6 md:px-10 md:py-10">
            <div className="mx-auto w-full max-w-3xl space-y-8">
              {showContentHeader && (
                <div className="space-y-1">
                  <h2 className="font-semibold text-2xl tracking-tight">
                    {activeItem?.label}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {pageHeading?.description}
                  </p>
                </div>
              )}
              <SettingsPageHeading value={pageHeading}>
                {activeTab === 'onboarding_guide' ? onboardingPanel : children}
              </SettingsPageHeading>
            </div>
          </div>
        </main>
      </SidebarProvider>
    </DialogContent>
  );
}
