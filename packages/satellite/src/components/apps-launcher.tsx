'use client';

import { ArrowRight, ExternalLink, X } from '@tuturuuu/icons';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useLocalStorage } from '@tuturuuu/ui/hooks/use-local-storage';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import type {
  LaunchableApp,
  LaunchableWorkspace,
} from '@tuturuuu/utils/launchable-apps';
import {
  LAUNCHABLE_APPS,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { type AppOpenMode, AppsLauncherCatalog } from './apps-launcher-catalog';

interface AppsLauncherDialogProps {
  currentWorkspace?: LaunchableWorkspace | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const APP_OPEN_MODE_STORAGE_KEY = 'tuturuuu-apps-launcher-open-mode';

export function AppsLauncherDialog({
  currentWorkspace,
  onOpenChange,
  open,
}: AppsLauncherDialogProps) {
  const t = useTranslations('command_launcher');
  const commonT = useTranslations('common');
  const [storedOpenMode, setStoredOpenMode] = useLocalStorage<AppOpenMode>(
    APP_OPEN_MODE_STORAGE_KEY,
    'new-tab'
  );
  const openMode = storedOpenMode === 'current-tab' ? 'current-tab' : 'new-tab';
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-w-none flex-col gap-0 overflow-hidden border-border/70 bg-background p-0 sm:max-w-none sm:rounded-xl"
        showCloseButton={false}
        style={dialogStyle}
      >
        <DialogHeader className="grid w-full shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-muted/20 px-3 py-2.5 text-left sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <LauncherMark />
            <div className="min-w-0">
              <DialogTitle className="font-semibold text-base tracking-tight">
                {t('apps')}
              </DialogTitle>
              <DialogDescription className="mt-0.5 hidden text-xs sm:block">
                {t('apps_description')}
              </DialogDescription>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <OpenModeControl
              currentLabel={t('open_here')}
              label={t('open_options')}
              mode={openMode}
              newLabel={t('open_in_new_tab')}
              onModeChange={setStoredOpenMode}
            />
            <DialogClose className="flex size-7 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="size-3.5" />
              <span className="sr-only">{commonT('close')}</span>
            </DialogClose>
          </div>
        </DialogHeader>

        <div
          className="min-h-0 w-full flex-1 overflow-hidden"
          data-slot="apps-launcher-body"
        >
          <AppsLauncherCatalog
            apps={LAUNCHABLE_APPS}
            getAppUrl={resolveUrl}
            getAppTitle={(app) => appNames[app.slug] ?? app.title}
            getCategoryLabel={(category) => t(`app_categories.${category}`)}
            onOpen={() => onOpenChange(false)}
            openMode={openMode}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LauncherMark() {
  return (
    <div
      aria-hidden="true"
      className="grid size-9 shrink-0 grid-cols-2 gap-1 rounded-lg border bg-background p-1.5 shadow-xs"
      data-slot="apps-launcher-mark"
    >
      <span className="rounded-[3px] bg-dynamic-blue" />
      <span className="rounded-[3px] bg-dynamic-green" />
      <span className="rounded-[3px] bg-dynamic-orange" />
      <span className="rounded-[3px] bg-dynamic-purple" />
    </div>
  );
}

function OpenModeControl({
  currentLabel,
  label,
  mode,
  newLabel,
  onModeChange,
}: {
  currentLabel: string;
  label: string;
  mode: AppOpenMode;
  newLabel: string;
  onModeChange: (mode: AppOpenMode) => void;
}) {
  return (
    <div
      className="flex shrink-0 items-center"
      data-slot="apps-launcher-open-mode"
    >
      <ToggleGroup
        aria-label={label}
        className="rounded-lg border bg-background/80 p-0.5"
        onValueChange={(value) => {
          if (value === 'current-tab' || value === 'new-tab') {
            onModeChange(value);
          }
        }}
        type="single"
        value={mode}
      >
        <ToggleGroupItem
          aria-label={currentLabel}
          className="data-[selected=true]:!border-foreground/20 data-[selected=true]:!bg-foreground data-[selected=true]:!text-background h-7 min-w-7 gap-1.5 rounded-md border border-transparent px-2 text-muted-foreground text-xs data-[selected=true]:shadow-xs"
          data-selected={mode === 'current-tab'}
          value="current-tab"
        >
          <ArrowRight className="size-3.5" />
          <span className="hidden sm:inline">{currentLabel}</span>
        </ToggleGroupItem>
        <ToggleGroupItem
          aria-label={newLabel}
          className="data-[selected=true]:!border-foreground/20 data-[selected=true]:!bg-foreground data-[selected=true]:!text-background h-7 min-w-7 gap-1.5 rounded-md border border-transparent px-2 text-muted-foreground text-xs data-[selected=true]:shadow-xs"
          data-selected={mode === 'new-tab'}
          value="new-tab"
        >
          <ExternalLink className="size-3.5" />
          <span className="hidden sm:inline">{newLabel}</span>
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
