'use client';

import {
  Blocks,
  BookOpen,
  BookText,
  Boxes,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Code2,
  ExternalLink,
  FileText,
  Folder,
  Globe,
  GraduationCap,
  History,
  type LucideIcon,
  Mail,
  MessageSquare,
  Package,
  QrCode,
  Server,
  Smartphone,
  Sparkles,
  SquareTerminal,
  Store,
  Wallet,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import type {
  LaunchableApp,
  LaunchableAppCategory,
  LaunchableWorkspace,
} from '@tuturuuu/utils/launchable-apps';
import {
  LAUNCHABLE_APP_CATEGORIES,
  LAUNCHABLE_APPS,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { useState } from 'react';

interface AppsLauncherDialogProps {
  currentWorkspace?: LaunchableWorkspace | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const APP_ICONS: Partial<Record<LaunchableApp['slug'], LucideIcon>> = {
  apps: Boxes,
  calendar: Calendar,
  chat: MessageSquare,
  cms: FileText,
  drive: Folder,
  external: Blocks,
  finance: Wallet,
  hive: Server,
  inventory: Package,
  learn: GraduationCap,
  mail: Mail,
  meet: Smartphone,
  mind: Brain,
  nova: Sparkles,
  platform: SquareTerminal,
  playground: Code2,
  rewise: BookOpen,
  shortener: Globe,
  storefront: Store,
  tasks: CheckCircle2,
  teach: BookText,
  tools: QrCode,
  track: History,
};

const APP_CATEGORY_TABS = ['all', ...LAUNCHABLE_APP_CATEGORIES] as const;

type AppCategoryTab = (typeof APP_CATEGORY_TABS)[number];

const CATEGORY_ACCENTS: Record<LaunchableAppCategory, string> = {
  ai: 'var(--chart-4)',
  content: 'var(--chart-3)',
  core: 'var(--primary)',
  developer: 'var(--chart-1)',
  learning: 'var(--chart-5)',
  operations: 'var(--chart-4)',
  productivity: 'var(--chart-2)',
};

export function AppsLauncherDialog({
  currentWorkspace,
  onOpenChange,
  open,
}: AppsLauncherDialogProps) {
  const t = useTranslations('command_launcher');
  const [activeTab, setActiveTab] = useState<AppCategoryTab>('all');

  function resolveUrl(app: LaunchableApp) {
    return resolveLaunchableAppUrl({
      app,
      currentOrigin:
        typeof window === 'undefined' ? undefined : window.location.origin,
      searchParams: {
        source: 'sidebar-apps',
      },
      workspace: currentWorkspace,
    });
  }

  function openApp(app: LaunchableApp, target: 'current-tab' | 'new-tab') {
    const url = resolveUrl(app);
    onOpenChange(false);

    if (target === 'current-tab') {
      window.location.assign(url);
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function getAppsForTab(tab: AppCategoryTab) {
    if (tab === 'all') return LAUNCHABLE_APPS;
    return LAUNCHABLE_APPS.filter((app) => app.category === tab);
  }

  const activeApps = getAppsForTab(activeTab);
  const dialogStyle = {
    height: '760px',
    maxHeight: 'calc(100vh - 2rem)',
  } as CSSProperties;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex w-[calc(100vw-2rem)] max-w-[1120px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1120px] xl:max-w-[1240px]"
        style={dialogStyle}
      >
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 text-left">
          <DialogTitle>{t('apps')}</DialogTitle>
          <DialogDescription>{t('apps_description')}</DialogDescription>
        </DialogHeader>

        <Tabs
          className="shrink-0 gap-0 overflow-hidden border-b bg-muted/20 px-3 py-2"
          onValueChange={(value) => setActiveTab(value as AppCategoryTab)}
          value={activeTab}
        >
          <TabsList className="h-auto max-w-full justify-start gap-1 overflow-x-auto rounded-md bg-muted/70 p-1">
            {APP_CATEGORY_TABS.map((tab) => (
              <TabsTrigger
                className="shrink-0 px-3 text-xs"
                key={tab}
                value={tab}
              >
                {t(`app_categories.${tab}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div
          className="min-h-0 flex-1 overflow-hidden"
          data-slot="apps-launcher-body"
        >
          <AppsTabPanel
            activeTab={activeTab}
            apps={activeApps}
            getCategoryLabel={(category) => t(`app_categories.${category}`)}
            onOpen={openApp}
            openHereLabel={t('open_here')}
            openInNewTabLabel={t('open_in_new_tab')}
            openOptionsLabel={t('open_options')}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AppsTabPanel({
  activeTab,
  apps,
  getCategoryLabel,
  onOpen,
  openHereLabel,
  openInNewTabLabel,
  openOptionsLabel,
}: {
  activeTab: AppCategoryTab;
  apps: readonly LaunchableApp[];
  getCategoryLabel: (category: LaunchableAppCategory) => string;
  onOpen: (app: LaunchableApp, target: 'current-tab' | 'new-tab') => void;
  openHereLabel: string;
  openInNewTabLabel: string;
  openOptionsLabel: string;
}) {
  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-slot="apps-launcher-panel"
    >
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
        data-slot="apps-launcher-scroll"
      >
        {activeTab === 'all' ? (
          <AppsByCategory
            apps={apps}
            getCategoryLabel={getCategoryLabel}
            onOpen={onOpen}
            openHereLabel={openHereLabel}
            openInNewTabLabel={openInNewTabLabel}
            openOptionsLabel={openOptionsLabel}
          />
        ) : (
          <AppsGrid
            apps={apps}
            onOpen={onOpen}
            openHereLabel={openHereLabel}
            openInNewTabLabel={openInNewTabLabel}
            openOptionsLabel={openOptionsLabel}
          />
        )}
      </div>
    </div>
  );
}

function AppsByCategory({
  apps,
  getCategoryLabel,
  onOpen,
  openHereLabel,
  openInNewTabLabel,
  openOptionsLabel,
}: {
  apps: readonly LaunchableApp[];
  getCategoryLabel: (category: LaunchableAppCategory) => string;
  onOpen: (app: LaunchableApp, target: 'current-tab' | 'new-tab') => void;
  openHereLabel: string;
  openInNewTabLabel: string;
  openOptionsLabel: string;
}) {
  return (
    <div className="space-y-4" data-slot="apps-launcher-sections">
      {LAUNCHABLE_APP_CATEGORIES.map((category) => {
        const categoryApps = apps.filter((app) => app.category === category);

        if (categoryApps.length === 0) return null;

        const headingId = `apps-launcher-section-${category}`;

        return (
          <section
            aria-labelledby={headingId}
            data-slot="apps-launcher-section"
            key={category}
          >
            <h3
              className="mb-2 px-1 font-medium text-muted-foreground text-xs"
              id={headingId}
            >
              {getCategoryLabel(category)}
            </h3>
            <AppsGrid
              apps={categoryApps}
              onOpen={onOpen}
              openHereLabel={openHereLabel}
              openInNewTabLabel={openInNewTabLabel}
              openOptionsLabel={openOptionsLabel}
            />
          </section>
        );
      })}
    </div>
  );
}

function AppsGrid({
  apps,
  onOpen,
  openHereLabel,
  openInNewTabLabel,
  openOptionsLabel,
}: {
  apps: readonly LaunchableApp[];
  onOpen: (app: LaunchableApp, target: 'current-tab' | 'new-tab') => void;
  openHereLabel: string;
  openInNewTabLabel: string;
  openOptionsLabel: string;
}) {
  return (
    <div
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
      data-slot="apps-launcher-grid"
    >
      {apps.map((app) => (
        <AppLauncherItem
          app={app}
          key={app.slug}
          onOpen={onOpen}
          openHereLabel={openHereLabel}
          openInNewTabLabel={openInNewTabLabel}
          openOptionsLabel={openOptionsLabel}
        />
      ))}
    </div>
  );
}

function AppLauncherItem({
  app,
  onOpen,
  openHereLabel,
  openInNewTabLabel,
  openOptionsLabel,
}: {
  app: LaunchableApp;
  onOpen: (app: LaunchableApp, target: 'current-tab' | 'new-tab') => void;
  openHereLabel: string;
  openInNewTabLabel: string;
  openOptionsLabel: string;
}) {
  const Icon = APP_ICONS[app.slug] ?? Boxes;
  const accent = CATEGORY_ACCENTS[app.category];
  const cardStyle = {
    '--app-accent': accent,
    background:
      'linear-gradient(135deg, color-mix(in srgb, var(--app-accent) 14%, var(--card)) 0%, var(--card) 62%)',
    borderColor: 'color-mix(in srgb, var(--app-accent) 32%, var(--border))',
  } as CSSProperties;

  return (
    <div
      className="flex min-h-0 items-center gap-2 overflow-hidden rounded-md border p-2 text-card-foreground shadow-sm transition hover:shadow-md"
      data-slot="app-card"
      style={cardStyle}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background/70 shadow-xs"
          style={{
            borderColor:
              'color-mix(in srgb, var(--app-accent) 40%, var(--border))',
            color: 'var(--app-accent)',
          }}
        >
          <Icon className="size-4" />
        </span>

        <span
          className="min-w-0 truncate font-semibold text-sm"
          data-slot="app-card-title"
        >
          {app.title}
        </span>
      </span>

      <span
        className="flex shrink-0 items-center gap-1"
        data-slot="app-card-actions"
      >
        <AppLaunchMenu
          app={app}
          onOpen={onOpen}
          openHereLabel={openHereLabel}
          openInNewTabLabel={openInNewTabLabel}
          openOptionsLabel={openOptionsLabel}
        />
      </span>
    </div>
  );
}

function AppLaunchMenu({
  app,
  onOpen,
  openHereLabel,
  openInNewTabLabel,
  openOptionsLabel,
}: {
  app: LaunchableApp;
  onOpen: (app: LaunchableApp, target: 'current-tab' | 'new-tab') => void;
  openHereLabel: string;
  openInNewTabLabel: string;
  openOptionsLabel: string;
}) {
  const label = `${openOptionsLabel}: ${app.title}`;

  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={label}
              className="size-8 shrink-0"
              size="icon"
              type="button"
              variant="secondary"
            >
              <ChevronRight className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{openOptionsLabel}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => onOpen(app, 'current-tab')}>
          <ChevronRight className="size-4" />
          {openHereLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpen(app, 'new-tab')}>
          <ExternalLink className="size-4" />
          {openInNewTabLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
