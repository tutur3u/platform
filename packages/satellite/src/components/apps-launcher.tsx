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

const CATEGORY_TONES: Record<
  LaunchableAppCategory,
  {
    affordance: string;
    card: string;
    icon: string;
  }
> = {
  ai: {
    affordance:
      'group-hover:bg-dynamic-cyan/10 group-hover:text-dynamic-cyan group-focus-visible:bg-dynamic-cyan/10 group-focus-visible:text-dynamic-cyan',
    card: 'border-dynamic-cyan/30 bg-dynamic-cyan/10 hover:border-dynamic-cyan/50 hover:bg-dynamic-cyan/15',
    icon: 'border-dynamic-cyan/35 bg-dynamic-cyan/10 text-dynamic-cyan',
  },
  learning: {
    affordance:
      'group-hover:bg-dynamic-orange/10 group-hover:text-dynamic-orange group-focus-visible:bg-dynamic-orange/10 group-focus-visible:text-dynamic-orange',
    card: 'border-dynamic-orange/30 bg-dynamic-orange/10 hover:border-dynamic-orange/50 hover:bg-dynamic-orange/15',
    icon: 'border-dynamic-orange/35 bg-dynamic-orange/10 text-dynamic-orange',
  },
  miscellaneous: {
    affordance:
      'group-hover:bg-dynamic-red/10 group-hover:text-dynamic-red group-focus-visible:bg-dynamic-red/10 group-focus-visible:text-dynamic-red',
    card: 'border-dynamic-red/30 bg-dynamic-red/10 hover:border-dynamic-red/50 hover:bg-dynamic-red/15',
    icon: 'border-dynamic-red/35 bg-dynamic-red/10 text-dynamic-red',
  },
  operations: {
    affordance:
      'group-hover:bg-dynamic-green/10 group-hover:text-dynamic-green group-focus-visible:bg-dynamic-green/10 group-focus-visible:text-dynamic-green',
    card: 'border-dynamic-green/30 bg-dynamic-green/10 hover:border-dynamic-green/50 hover:bg-dynamic-green/15',
    icon: 'border-dynamic-green/35 bg-dynamic-green/10 text-dynamic-green',
  },
  productivity: {
    affordance:
      'group-hover:bg-dynamic-blue/10 group-hover:text-dynamic-blue group-focus-visible:bg-dynamic-blue/10 group-focus-visible:text-dynamic-blue',
    card: 'border-dynamic-blue/30 bg-dynamic-blue/10 hover:border-dynamic-blue/50 hover:bg-dynamic-blue/15',
    icon: 'border-dynamic-blue/35 bg-dynamic-blue/10 text-dynamic-blue',
  },
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
  const tone = CATEGORY_TONES[app.category];

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onOpen(app, event.ctrlKey || event.metaKey ? 'current-tab' : 'new-tab');
  }

  return (
    <button
      aria-label={app.title}
      className={cn(
        'group flex min-h-0 w-full cursor-pointer items-center gap-2 overflow-hidden rounded-md border p-2 text-left text-card-foreground shadow-sm outline-none transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        tone.card
      )}
      data-slot="app-card"
      onClick={handleClick}
      type="button"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md border shadow-xs transition-transform duration-200 ease-out group-hover:scale-105 group-focus-visible:scale-105 motion-reduce:transition-none',
            tone.icon
          )}
          data-slot="app-card-icon"
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
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md bg-background/60 text-muted-foreground/70 transition-[background-color,color,transform] duration-200 ease-out group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0',
          tone.affordance
        )}
        data-slot="app-card-affordance"
      >
        <ChevronRight className="size-4" />
      </span>
    </button>
  );
}
