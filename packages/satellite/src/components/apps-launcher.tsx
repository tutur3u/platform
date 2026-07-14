'use client';

import { ArrowRight, ExternalLink } from '@tuturuuu/icons';
import {
  Dialog,
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
        style={dialogStyle}
      >
        <DialogHeader className="flex w-full shrink-0 flex-col gap-3 border-b bg-muted/20 px-4 py-3 pr-12 text-left sm:flex-row sm:items-center sm:justify-between sm:pr-12">
          <div className="flex min-w-0 items-center gap-3">
            <LauncherMark />
            <div className="min-w-0">
              <DialogTitle className="font-semibold text-base tracking-tight">
                {t('apps')}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                {t('apps_description')}
              </DialogDescription>
            </div>
          </div>

          <OpenModeControl
            currentLabel={t('open_here')}
            label={t('open_options')}
            mode={openMode}
            newLabel={t('open_in_new_tab')}
            onModeChange={setStoredOpenMode}
          />
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
      className="grid size-10 shrink-0 grid-cols-2 gap-1 rounded-xl border bg-background p-2 shadow-xs"
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
      className="flex shrink-0 items-center gap-2"
      data-slot="apps-launcher-open-mode"
    >
      <span className="hidden text-muted-foreground text-xs lg:inline">
        {label}
      </span>
      <ToggleGroup
        aria-label={label}
        className="rounded-lg border bg-background p-0.5 shadow-xs"
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
          className="h-7 gap-1.5 rounded-md px-2.5 text-xs data-[state=on]:bg-foreground data-[state=on]:text-background"
          value="current-tab"
        >
          <ArrowRight className="size-3.5" />
          {currentLabel}
        </ToggleGroupItem>
        <ToggleGroupItem
          aria-label={newLabel}
          className="h-7 gap-1.5 rounded-md px-2.5 text-xs data-[state=on]:bg-foreground data-[state=on]:text-background"
          value="new-tab"
        >
          <ExternalLink className="size-3.5" />
          {newLabel}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
