'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import type {
  LaunchableApp,
  LaunchableWorkspace,
} from '@tuturuuu/utils/launchable-apps';
import {
  LAUNCHABLE_APPS,
  resolveLaunchableAppPath,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';
import { type ElementType, useRef, useState } from 'react';
import { useAppsLauncherPrefetch } from './apps-launcher-prefetch';
import { AppsLauncherCatalog } from './apps-launcher-catalog';
import {
  AppsLauncherOpenModeMenu,
  AppsLauncherSearchBar,
} from './apps-launcher-controls';
import { getCurrentLaunchableAppSlug } from './apps-launcher-current';
import {
  useAppsLauncherFavorites,
  useAppsLauncherRecent,
} from './apps-launcher-favorites';
import {
  useAppsLauncherKeyboard,
  useAppsLauncherShortcut,
} from './apps-launcher-keyboard';
import { AppsLauncherKeyboardHints } from './apps-launcher-keyboard-hints';
import { useAppsLauncherOpenMode } from './apps-launcher-preference';
import {
  type AppsLauncherSection,
  buildAppsLauncherView,
  getDefaultAppsLauncherEntry,
} from './apps-launcher-view';

export type AppsLauncherTranslate = (
  key: string,
  values?: Record<string, number | string>
) => string;

export interface AppsLauncherCoreDialogProps {
  closeLabel: string;
  currentWorkspace?: LaunchableWorkspace | null;
  linkComponent?: ElementType;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  t: AppsLauncherTranslate;
}

export function AppsLauncherCoreDialog({
  closeLabel,
  currentWorkspace,
  linkComponent,
  onOpenChange,
  open,
  t,
}: AppsLauncherCoreDialogProps) {
  const [openMode, setOpenMode] = useAppsLauncherOpenMode();
  useAppsLauncherPrefetch(open && openMode === 'current-tab');
  const { favorites, toggleFavorite } = useAppsLauncherFavorites();
  const { recent, recordRecent } = useAppsLauncherRecent();
  const [query, setQuery] = useState('');
  const dialogContentRef = useRef<HTMLDivElement>(null);

  const getAppTitle = (app: LaunchableApp) => t(`app_names.${app.slug}`);
  const currentSlug =
    typeof window === 'undefined'
      ? undefined
      : getCurrentLaunchableAppSlug(window.location.href);
  const view = buildAppsLauncherView({
    apps: LAUNCHABLE_APPS,
    favorites,
    getCopy: (app) => ({
      description: t(`app_descriptions.${app.slug}`),
      title: getAppTitle(app),
    }),
    query,
    recent,
  });
  const { activeEntry, handleSearchKeyDown, resetActiveEntry, setActiveEntry } =
    useAppsLauncherKeyboard({
      contentRef: dialogContentRef,
      defaultEntry: getDefaultAppsLauncherEntry(view, { currentSlug, query }),
      entries: view.entries,
      onToggleFavorite: toggleFavorite,
    });

  useAppsLauncherShortcut(() => onOpenChange(true));

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setQuery('');
      resetActiveEntry();
    }
    onOpenChange(nextOpen);
  }

  function resolveUrl(app: LaunchableApp) {
    const currentOrigin =
      typeof window === 'undefined' ? undefined : window.location.origin;
    const searchParams = { source: 'sidebar-apps' };

    if (currentOrigin === 'https://tuturuuu.com') {
      if (app.slug === 'meet') {
        return new URL('/meet/personal/meetings', currentOrigin).href;
      }
      if (app.slug === 'mail' || app.slug === 'calendar') {
        const workspacePath = resolveLaunchableAppPath({
          app,
          workspace: currentWorkspace,
        });
        const entry = app.slug === 'mail' ? '/inbox' : '';
        const url = new URL(
          `/${app.slug}${workspacePath}${entry}`,
          currentOrigin
        );
        url.search = new URLSearchParams(searchParams).toString();
        return url.href;
      }
    }

    return resolveLaunchableAppUrl({
      app,
      currentOrigin,
      searchParams,
      workspace: currentWorkspace,
    });
  }

  function getSectionLabel(section: AppsLauncherSection) {
    if (section.category) return t(`app_categories.${section.category}`);
    if (section.id === 'recent') return t('recent');
    if (section.id === 'favorites') return t('favorites');
    return t('results');
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="top-[max(1rem,env(safe-area-inset-top,0px))] flex max-h-[calc(100%-2rem-env(safe-area-inset-top,0px))] w-[min(640px,calc(100%-1rem))] max-w-none translate-y-0 flex-col gap-0 overflow-hidden rounded-(--radius-popover) border bg-popover p-0 text-popover-foreground shadow-lg sm:top-20 sm:max-h-[calc(100%-6rem)] sm:max-w-none"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (window.innerWidth < 768) return;
          dialogContentRef.current
            ?.querySelector<HTMLElement>('[data-slot="apps-launcher-search"]')
            ?.focus();
        }}
        ref={dialogContentRef}
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{t('apps')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('apps_description')}
        </DialogDescription>
        <AppsLauncherSearchBar
          activeEntryId={activeEntry?.id}
          closeLabel={closeLabel}
          onQueryChange={(nextQuery) => {
            setQuery(nextQuery);
            resetActiveEntry();
          }}
          onSearchKeyDown={handleSearchKeyDown}
          query={query}
          searchLabel={t('search_apps')}
        />
        <div
          className="max-h-[440px] min-h-0 overflow-y-auto overscroll-contain p-1"
          data-slot="apps-launcher-body"
        >
          <AppsLauncherCatalog
            activeEntryId={activeEntry?.id}
            currentLabel={t('current')}
            currentSlug={currentSlug}
            emptyLabel={t('no_results', { query: query.trim() })}
            favorites={favorites}
            getAppTitle={getAppTitle}
            getAppUrl={resolveUrl}
            getCategoryLabel={(app) => t(`app_categories.${app.category}`)}
            getFavoriteLabel={(app, isFavorite) =>
              t(isFavorite ? 'favorite_remove' : 'favorite_add', {
                app: getAppTitle(app),
              })
            }
            getSectionLabel={getSectionLabel}
            linkComponent={linkComponent}
            listLabel={t('apps')}
            onActiveEntryChange={(entry) => setActiveEntry(entry)}
            onOpen={(app) => {
              recordRecent(app.slug);
              handleOpenChange(false);
            }}
            onToggleFavorite={toggleFavorite}
            openMode={openMode}
            sections={view.sections}
          />
          <span aria-live="polite" className="sr-only">
            {query.trim()
              ? t('apps_count', { count: view.entries.length })
              : null}
          </span>
        </div>
        <AppsLauncherKeyboardHints
          closeLabel={t('hint_close')}
          favoriteLabel={t('hint_favorite')}
          navigateLabel={t('hint_navigate')}
          openLabel={t('hint_open')}
        >
          <AppsLauncherOpenModeMenu
            currentLabel={t('open_current_tab')}
            label={t('open_apps_in')}
            mode={openMode}
            newLabel={t('open_new_tab')}
            onModeChange={setOpenMode}
            optionsLabel={t('open_options')}
          />
        </AppsLauncherKeyboardHints>
      </DialogContent>
    </Dialog>
  );
}
