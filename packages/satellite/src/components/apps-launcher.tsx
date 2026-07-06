'use client';

import {
  Blocks,
  BookOpen,
  BookText,
  Boxes,
  Brain,
  Calendar,
  CheckCircle2,
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
  MoreHorizontal,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[calc(100dvh-2rem)] max-h-[760px] w-[calc(100vw-2rem)] max-w-[860px] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-[860px]">
        <DialogHeader className="border-b px-5 py-4 pr-12 text-left">
          <DialogTitle>{t('apps')}</DialogTitle>
          <DialogDescription>{t('apps_description')}</DialogDescription>
        </DialogHeader>

        <Tabs
          className="h-full min-h-0 gap-0 overflow-hidden"
          defaultValue="all"
        >
          <div className="shrink-0 border-b bg-muted/20 px-3 py-2">
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
          </div>

          {APP_CATEGORY_TABS.map((tab) => {
            const apps = getAppsForTab(tab);

            return (
              <TabsContent
                className="m-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
                key={tab}
                value={tab}
              >
                <AppsTabPanel
                  apps={apps}
                  categoryDescription={t(`app_category_descriptions.${tab}`)}
                  countLabel={t('apps_count', { count: apps.length })}
                  currentWorkspace={currentWorkspace}
                  onOpen={openApp}
                  openHereLabel={t('open_here')}
                  openInNewTabLabel={t('open_in_new_tab')}
                  openOptionsLabel={t('open_options')}
                />
              </TabsContent>
            );
          })}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function AppsTabPanel({
  apps,
  categoryDescription,
  countLabel,
  currentWorkspace,
  onOpen,
  openHereLabel,
  openInNewTabLabel,
  openOptionsLabel,
}: {
  apps: readonly LaunchableApp[];
  categoryDescription: string;
  countLabel: string;
  currentWorkspace?: LaunchableWorkspace | null;
  onOpen: (app: LaunchableApp, target: 'current-tab' | 'new-tab') => void;
  openHereLabel: string;
  openInNewTabLabel: string;
  openOptionsLabel: string;
}) {
  return (
    <div
      className="h-full max-h-full min-h-0 overflow-y-auto overscroll-contain p-3"
      data-slot="apps-launcher-scroll"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1 text-muted-foreground text-xs">
        <span>{categoryDescription}</span>
        <span className="font-medium">{countLabel}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {apps.map((app) => (
          <AppLauncherItem
            app={app}
            currentWorkspace={currentWorkspace}
            key={app.slug}
            onOpen={onOpen}
            openHereLabel={openHereLabel}
            openInNewTabLabel={openInNewTabLabel}
            openOptionsLabel={openOptionsLabel}
          />
        ))}
      </div>
    </div>
  );
}

function AppLauncherItem({
  app,
  currentWorkspace,
  onOpen,
  openHereLabel,
  openInNewTabLabel,
  openOptionsLabel,
}: {
  app: LaunchableApp;
  currentWorkspace?: LaunchableWorkspace | null;
  onOpen: (app: LaunchableApp, target: 'current-tab' | 'new-tab') => void;
  openHereLabel: string;
  openInNewTabLabel: string;
  openOptionsLabel: string;
}) {
  const Icon = APP_ICONS[app.slug] ?? Boxes;
  const t = useTranslations('command_launcher');
  const accent = CATEGORY_ACCENTS[app.category];
  const aliases = app.aliases.slice(0, 3).join(', ');
  const domain = formatAppDomain(app.productionUrl);
  const destination = app.workspacePathResolver
    ? t('workspace_destination', {
        workspace: currentWorkspace?.name?.trim() || t('current_workspace'),
      })
    : t('default_destination');
  const cardStyle = {
    '--app-accent': accent,
    background:
      'linear-gradient(135deg, color-mix(in srgb, var(--app-accent) 14%, var(--card)) 0%, var(--card) 62%)',
    borderColor: 'color-mix(in srgb, var(--app-accent) 32%, var(--border))',
  } as CSSProperties;

  return (
    <div
      className="group grid grid-cols-[minmax(0,1fr)_auto] items-stretch overflow-hidden rounded-lg border text-card-foreground shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      data-slot="app-card"
      style={cardStyle}
    >
      <button
        aria-label={`${openInNewTabLabel}: ${app.title}`}
        className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 px-3 py-3 text-left"
        onClick={() => onOpen(app, 'new-tab')}
        type="button"
      >
        <span
          className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md border bg-background/70 shadow-xs"
          style={{
            borderColor:
              'color-mix(in srgb, var(--app-accent) 40%, var(--border))',
            color: 'var(--app-accent)',
          }}
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 space-y-2">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="block truncate font-semibold text-sm"
              data-slot="app-card-title"
            >
              {app.title}
            </span>
            <span
              className="shrink-0 rounded-full border bg-background/70 px-2 py-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-normal"
              data-slot="app-card-category"
              style={{
                borderColor:
                  'color-mix(in srgb, var(--app-accent) 35%, var(--border))',
              }}
            >
              {t(`app_categories.${app.category}`)}
            </span>
          </span>
          <span
            className="block truncate text-muted-foreground text-xs"
            data-slot="app-card-slot-text"
          >
            {t('aliases_slot', { aliases })}
          </span>
          <span className="grid min-w-0 gap-1 text-xs">
            <span
              className="block truncate font-medium"
              data-slot="app-card-destination"
            >
              {destination}
            </span>
            <span
              className="block truncate text-muted-foreground"
              data-slot="app-card-domain"
            >
              {domain}
            </span>
          </span>
        </span>
      </button>

      <div className="flex items-start pt-2 pr-2">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`${openOptionsLabel}: ${app.title}`}
              className={cn(
                'size-8 shrink-0 text-muted-foreground opacity-80 transition',
                'hover:bg-background/80 hover:text-foreground group-hover:opacity-100'
              )}
              size="icon"
              type="button"
              variant="ghost"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => onOpen(app, 'new-tab')}>
              <ExternalLink className="size-4" />
              {openInNewTabLabel}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOpen(app, 'current-tab')}>
              <SquareTerminal className="size-4" />
              {openHereLabel}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function formatAppDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
