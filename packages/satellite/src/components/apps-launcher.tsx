'use client';

import { X } from '@tuturuuu/icons';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import type {
  LaunchableApp,
  LaunchableWorkspace,
} from '@tuturuuu/utils/launchable-apps';
import {
  LAUNCHABLE_APP_CATEGORIES,
  LAUNCHABLE_APPS,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';
import { useTranslations } from 'next-intl';
import { type CSSProperties, useRef, useState } from 'react';
import { AppsLauncherCatalog } from './apps-launcher-catalog';
import { AppsLauncherToolbar, LauncherMark } from './apps-launcher-controls';
import {
  useAppsLauncherKeyboard,
  useAppsLauncherShortcut,
} from './apps-launcher-keyboard';
import { useAppsLauncherOpenMode } from './apps-launcher-preference';
import { rankAppsLauncherMatches } from './apps-launcher-search';

interface AppsLauncherDialogProps {
  currentWorkspace?: LaunchableWorkspace | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function AppsLauncherDialog({
  currentWorkspace,
  onOpenChange,
  open,
}: AppsLauncherDialogProps) {
  const t = useTranslations('command_launcher');
  const commonT = useTranslations('common');
  const [openMode, setOpenMode] = useAppsLauncherOpenMode();
  const [query, setQuery] = useState('');
  const dialogContentRef = useRef<HTMLDivElement>(null);

  const getAppTitle = (app: LaunchableApp) =>
    t(`app_names.${app.slug}` as never);
  const getAppDescription = (app: LaunchableApp) =>
    t(`app_descriptions.${app.slug}` as never);
  const rankedApps = rankAppsLauncherMatches(LAUNCHABLE_APPS, query, (app) => ({
    description: getAppDescription(app),
    title: getAppTitle(app),
  }));
  const navigationApps = LAUNCHABLE_APP_CATEGORIES.flatMap((category) =>
    rankedApps.filter((app) => app.category === category)
  );
  const {
    activeApp,
    handleAppKeyDown,
    handleSearchKeyDown,
    resetActiveApp,
    setActiveApp,
  } = useAppsLauncherKeyboard({
    contentRef: dialogContentRef,
    navigationApps,
    rankedApps,
  });

  useAppsLauncherShortcut(() => onOpenChange(true));

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setQuery('');
      resetActiveApp();
    }
    onOpenChange(nextOpen);
  }

  function resolveUrl(app: LaunchableApp) {
    return resolveLaunchableAppUrl({
      app,
      currentOrigin:
        typeof window === 'undefined' ? undefined : window.location.origin,
      searchParams: { source: 'sidebar-apps' },
      workspace: currentWorkspace,
    });
  }

  const dialogStyle = {
    height: '680px',
    maxHeight: 'calc(100dvh - 1rem)',
    maxWidth: '1320px',
    width: 'calc(100vw - 1rem)',
  } as CSSProperties;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-w-none flex-col gap-0 overflow-hidden border-border/70 bg-background p-0 sm:max-w-none sm:rounded-xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (window.innerWidth < 768) return;

          dialogContentRef.current
            ?.querySelector<HTMLElement>('[data-slot="apps-launcher-search"]')
            ?.focus();
        }}
        ref={dialogContentRef}
        showCloseButton={false}
        style={dialogStyle}
      >
        <DialogHeader className="flex w-full shrink-0 flex-row items-center gap-2 border-b bg-muted/20 px-3 py-2.5 text-left sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <LauncherMark />
            <div className="min-w-0">
              <DialogTitle className="font-semibold text-base tracking-tight">
                {t('apps')}
              </DialogTitle>
              <DialogDescription className="mt-0.5 line-clamp-1 text-[11px] sm:text-xs">
                {t('apps_description')}
              </DialogDescription>
            </div>
          </div>

          <AppsLauncherToolbar
            activeAppId={
              activeApp ? `apps-launcher-app-${activeApp.slug}` : undefined
            }
            currentLabel={t('open_current_tab')}
            mode={openMode}
            newLabel={t('open_new_tab')}
            onModeChange={setOpenMode}
            onQueryChange={(nextQuery) => {
              setQuery(nextQuery);
              resetActiveApp();
            }}
            onSearchKeyDown={handleSearchKeyDown}
            openModeLabel={t('open_apps_in')}
            openOptionsLabel={t('open_options')}
            query={query}
            searchLabel={t('search_apps')}
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <DialogClose
                aria-label={commonT('close')}
                className="flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden className="size-3.5" />
              </DialogClose>
            </TooltipTrigger>
            <TooltipContent side="bottom">{commonT('close')}</TooltipContent>
          </Tooltip>
        </DialogHeader>

        <div
          className="min-h-0 w-full flex-1 overflow-hidden"
          data-slot="apps-launcher-body"
        >
          <AppsLauncherCatalog
            activeAppSlug={activeApp?.slug}
            apps={rankedApps}
            appsCountLabel={t('apps_count', { count: rankedApps.length })}
            emptyDescription={t('no_apps_found_description')}
            emptyTitle={t('no_apps_found')}
            getAppDescription={getAppDescription}
            getAppUrl={resolveUrl}
            getAppTitle={getAppTitle}
            getCategoryLabel={(category) => t(`app_categories.${category}`)}
            navigateLabel={t('navigate')}
            onActiveAppChange={(app) => setActiveApp(app)}
            onAppKeyDown={handleAppKeyDown}
            onOpen={() => handleOpenChange(false)}
            openMode={openMode}
            selectLabel={t('select')}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
