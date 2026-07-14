import {
  ArrowRight,
  BookOpen,
  BookText,
  BookUser,
  Boxes,
  Brain,
  Calendar,
  CheckCircle2,
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
import { cn } from '@tuturuuu/utils/format';
import type {
  LaunchableApp,
  LaunchableAppCategory,
} from '@tuturuuu/utils/launchable-apps';
import { LAUNCHABLE_APP_CATEGORIES } from '@tuturuuu/utils/launchable-apps';
import Link from 'next/link';

export type AppOpenMode = 'current-tab' | 'new-tab';

const APP_ICONS: Partial<Record<LaunchableApp['slug'], LucideIcon>> = {
  apps: Boxes,
  calendar: Calendar,
  chat: MessageSquare,
  cms: FileText,
  contacts: BookUser,
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

const CATEGORY_TONES: Record<
  LaunchableAppCategory,
  { card: string; dot: string; icon: string }
> = {
  ai: {
    card: 'border-dynamic-cyan/25 bg-dynamic-cyan/5 hover:border-dynamic-cyan/45 hover:bg-dynamic-cyan/10',
    dot: 'bg-dynamic-cyan',
    icon: 'border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan',
  },
  learning: {
    card: 'border-dynamic-orange/25 bg-dynamic-orange/5 hover:border-dynamic-orange/45 hover:bg-dynamic-orange/10',
    dot: 'bg-dynamic-orange',
    icon: 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
  },
  miscellaneous: {
    card: 'border-dynamic-red/25 bg-dynamic-red/5 hover:border-dynamic-red/45 hover:bg-dynamic-red/10',
    dot: 'bg-dynamic-red',
    icon: 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
  },
  operations: {
    card: 'border-dynamic-green/25 bg-dynamic-green/5 hover:border-dynamic-green/45 hover:bg-dynamic-green/10',
    dot: 'bg-dynamic-green',
    icon: 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
  },
  productivity: {
    card: 'border-dynamic-blue/25 bg-dynamic-blue/5 hover:border-dynamic-blue/45 hover:bg-dynamic-blue/10',
    dot: 'bg-dynamic-blue',
    icon: 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue',
  },
};

export function AppsLauncherCatalog({
  apps,
  getAppUrl,
  getAppTitle,
  getCategoryLabel,
  onOpen,
  openMode,
}: {
  apps: readonly LaunchableApp[];
  getAppUrl: (app: LaunchableApp) => string;
  getAppTitle: (app: LaunchableApp) => string;
  getCategoryLabel: (category: LaunchableAppCategory) => string;
  onOpen: () => void;
  openMode: AppOpenMode;
}) {
  return (
    <div
      className="flex h-full min-h-0 w-full flex-col"
      data-slot="apps-launcher-panel"
    >
      <div
        className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4"
        data-slot="apps-launcher-scroll"
      >
        <div className="w-full space-y-3" data-slot="apps-launcher-sections">
          {LAUNCHABLE_APP_CATEGORIES.map((category) => {
            const categoryApps = apps.filter(
              (app) => app.category === category
            );

            if (categoryApps.length === 0) return null;

            return (
              <AppCategorySection
                apps={categoryApps}
                category={category}
                getAppTitle={getAppTitle}
                getAppUrl={getAppUrl}
                key={category}
                label={getCategoryLabel(category)}
                onOpen={onOpen}
                openMode={openMode}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AppCategorySection({
  apps,
  category,
  getAppTitle,
  getAppUrl,
  label,
  onOpen,
  openMode,
}: {
  apps: readonly LaunchableApp[];
  category: LaunchableAppCategory;
  getAppTitle: (app: LaunchableApp) => string;
  getAppUrl: (app: LaunchableApp) => string;
  label: string;
  onOpen: () => void;
  openMode: AppOpenMode;
}) {
  const headingId = `apps-launcher-section-${category}`;

  return (
    <section
      aria-labelledby={headingId}
      className="w-full"
      data-slot="apps-launcher-section"
    >
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <span
          aria-hidden="true"
          className={cn('size-1.5 rounded-full', CATEGORY_TONES[category].dot)}
        />
        <h3
          className="font-medium text-muted-foreground text-xs"
          id={headingId}
        >
          {label}
        </h3>
      </div>
      <div
        className="grid w-full grid-cols-1 gap-1.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        data-slot="apps-launcher-grid"
      >
        {apps.map((app) => (
          <AppLauncherItem
            app={app}
            getAppUrl={getAppUrl}
            key={app.slug}
            onOpen={onOpen}
            openMode={openMode}
            title={getAppTitle(app)}
          />
        ))}
      </div>
    </section>
  );
}

function AppLauncherItem({
  app,
  title,
  getAppUrl,
  onOpen,
  openMode,
}: {
  app: LaunchableApp;
  title: string;
  getAppUrl: (app: LaunchableApp) => string;
  onOpen: () => void;
  openMode: AppOpenMode;
}) {
  const Icon = APP_ICONS[app.slug] ?? Boxes;
  const tone = CATEGORY_TONES[app.category];
  const href = getAppUrl(app);

  return (
    <Link
      aria-label={title}
      className={cn(
        'group flex min-h-0 w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-lg border p-2.5 text-left text-card-foreground outline-none transition-[background-color,border-color,transform] duration-200 ease-out hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        tone.card
      )}
      data-slot="app-card"
      href={href}
      onClick={onOpen}
      prefetch={false}
      rel={openMode === 'new-tab' ? 'noopener noreferrer' : undefined}
      target={openMode === 'new-tab' ? '_blank' : undefined}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background/80 shadow-xs transition-transform duration-200 ease-out group-hover:scale-105 group-focus-visible:scale-105 motion-reduce:transition-none',
            tone.icon
          )}
          data-slot="app-card-icon"
        >
          <Icon className="size-[18px]" />
        </span>
        <span
          className="min-w-0 truncate font-medium text-sm tracking-tight"
          data-slot="app-card-title"
        >
          {title}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="shrink-0 text-muted-foreground/50 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
        data-slot="app-card-affordance"
      >
        {openMode === 'new-tab' ? (
          <ExternalLink className="size-3.5" />
        ) : (
          <ArrowRight className="size-3.5" />
        )}
      </span>
    </Link>
  );
}
