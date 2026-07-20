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
  LAUNCHABLE_APPS,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';
import { useTranslations } from 'next-intl';
import { type CSSProperties, useRef, useState } from 'react';
import { AppsLauncherCatalog } from './apps-launcher-catalog';
import { AppsLauncherToolbar, LauncherMark } from './apps-launcher-controls';
import { useAppsLauncherOpenMode } from './apps-launcher-preference';

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
  const appNames: Record<string, string> = {
    apps: t('app_names.apps'),
    calendar: t('app_names.calendar'),
    chat: t('app_names.chat'),
    cms: t('app_names.cms'),
    contacts: t('app_names.contacts'),
    docs: t('app_names.docs'),
    drive: t('app_names.drive'),
    finance: t('app_names.finance'),
    hive: t('app_names.hive'),
    inventory: t('app_names.inventory'),
    learn: t('app_names.learn'),
    mail: t('app_names.mail'),
    meet: t('app_names.meet'),
    mind: t('app_names.mind'),
    nova: t('app_names.nova'),
    pay: t('app_names.pay'),
    platform: t('app_names.platform'),
    rewise: t('app_names.rewise'),
    shortener: t('app_names.shortener'),
    storefront: t('app_names.storefront'),
    tasks: t('app_names.tasks'),
    teach: t('app_names.teach'),
    tools: t('app_names.tools'),
    track: t('app_names.track'),
  };
  const appDescriptions: Record<string, string> = {
    apps: t('app_descriptions.apps'),
    calendar: t('app_descriptions.calendar'),
    chat: t('app_descriptions.chat'),
    cms: t('app_descriptions.cms'),
    contacts: t('app_descriptions.contacts'),
    docs: t('app_descriptions.docs'),
    drive: t('app_descriptions.drive'),
    finance: t('app_descriptions.finance'),
    hive: t('app_descriptions.hive'),
    inventory: t('app_descriptions.inventory'),
    learn: t('app_descriptions.learn'),
    mail: t('app_descriptions.mail'),
    meet: t('app_descriptions.meet'),
    mind: t('app_descriptions.mind'),
    nova: t('app_descriptions.nova'),
    pay: t('app_descriptions.pay'),
    platform: t('app_descriptions.platform'),
    rewise: t('app_descriptions.rewise'),
    shortener: t('app_descriptions.shortener'),
    storefront: t('app_descriptions.storefront'),
    tasks: t('app_descriptions.tasks'),
    teach: t('app_descriptions.teach'),
    tools: t('app_descriptions.tools'),
    track: t('app_descriptions.track'),
  };

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setQuery('');
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
          const focusTarget =
            window.innerWidth < 768
              ? '[data-slot="apps-launcher-search-trigger"]'
              : '[data-slot="apps-launcher-search"]';
          dialogContentRef.current
            ?.querySelector<HTMLElement>(focusTarget)
            ?.focus();
        }}
        ref={dialogContentRef}
        showCloseButton={false}
        style={dialogStyle}
      >
        <DialogHeader className="flex w-full shrink-0 items-center gap-2 border-b bg-muted/20 px-3 py-2.5 text-left sm:px-4">
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
            currentLabel={t('open_current_tab')}
            mode={openMode}
            newLabel={t('open_new_tab')}
            onModeChange={setOpenMode}
            onQueryChange={setQuery}
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
            apps={LAUNCHABLE_APPS}
            emptyDescription={t('no_apps_found_description')}
            emptyTitle={t('no_apps_found')}
            getAppDescription={(app) => appDescriptions[app.slug] ?? app.title}
            getAppUrl={resolveUrl}
            getAppTitle={(app) => appNames[app.slug] ?? app.title}
            getCategoryLabel={(category) => t(`app_categories.${category}`)}
            onOpen={() => handleOpenChange(false)}
            openMode={openMode}
            query={query}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
