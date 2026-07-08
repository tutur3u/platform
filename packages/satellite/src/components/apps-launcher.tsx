'use client';

import {
  BookOpen,
  BookText,
  Boxes,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronRight,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
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
import type { CSSProperties, MouseEvent } from 'react';
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
  docs: BookText,
  drive: Folder,
  finance: Wallet,
  hive: Server,
  inventory: Package,
  learn: GraduationCap,
  mail: Mail,
  meet: Smartphone,
  mind: Brain,
  nova: Sparkles,
  platform: SquareTerminal,
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
  ai: 'hsl(var(--dynamic-cyan))',
  core: 'hsl(var(--primary))',
  developer: 'hsl(var(--dynamic-purple))',
  learning: 'hsl(var(--dynamic-orange))',
  miscellaneous: 'hsl(var(--dynamic-red))',
  operations: 'hsl(var(--dynamic-green))',
  productivity: 'hsl(var(--dynamic-blue))',
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
}: {
  activeTab: AppCategoryTab;
  apps: readonly LaunchableApp[];
  getCategoryLabel: (category: LaunchableAppCategory) => string;
  onOpen: (app: LaunchableApp, target: 'current-tab' | 'new-tab') => void;
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
          />
        ) : (
          <AppsGrid apps={apps} onOpen={onOpen} />
        )}
      </div>
    </div>
  );
}

function AppsByCategory({
  apps,
  getCategoryLabel,
  onOpen,
}: {
  apps: readonly LaunchableApp[];
  getCategoryLabel: (category: LaunchableAppCategory) => string;
  onOpen: (app: LaunchableApp, target: 'current-tab' | 'new-tab') => void;
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
            <AppsGrid apps={categoryApps} onOpen={onOpen} />
          </section>
        );
      })}
    </div>
  );
}

function AppsGrid({
  apps,
  onOpen,
}: {
  apps: readonly LaunchableApp[];
  onOpen: (app: LaunchableApp, target: 'current-tab' | 'new-tab') => void;
}) {
  return (
    <div
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
      data-slot="apps-launcher-grid"
    >
      {apps.map((app) => (
        <AppLauncherItem app={app} key={app.slug} onOpen={onOpen} />
      ))}
    </div>
  );
}

function AppLauncherItem({
  app,
  onOpen,
}: {
  app: LaunchableApp;
  onOpen: (app: LaunchableApp, target: 'current-tab' | 'new-tab') => void;
}) {
  const Icon = APP_ICONS[app.slug] ?? Boxes;
  const accent = CATEGORY_ACCENTS[app.category];
  const cardStyle = {
    '--app-accent': accent,
    background:
      'linear-gradient(135deg, color-mix(in srgb, var(--app-accent) 14%, var(--card)) 0%, var(--card) 62%)',
    borderColor: 'color-mix(in srgb, var(--app-accent) 32%, var(--border))',
  } as CSSProperties;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onOpen(app, event.ctrlKey || event.metaKey ? 'current-tab' : 'new-tab');
  }

  return (
    <button
      aria-label={app.title}
      className="group flex min-h-0 w-full cursor-pointer items-center gap-2 overflow-hidden rounded-md border p-2 text-left text-card-foreground shadow-sm outline-none transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      data-slot="app-card"
      onClick={handleClick}
      style={cardStyle}
      type="button"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background/70 shadow-xs transition-transform duration-200 ease-out group-hover:scale-105 group-focus-visible:scale-105 motion-reduce:transition-none"
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
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background/60 text-muted-foreground/70 transition-[background-color,color,transform] duration-200 ease-out group-hover:translate-x-0.5 group-hover:bg-background/80 group-hover:text-foreground group-focus-visible:translate-x-0.5 group-focus-visible:bg-background/80 group-focus-visible:text-foreground motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
        data-slot="app-card-affordance"
      >
        <ChevronRight className="size-4" />
      </span>
    </button>
  );
}
