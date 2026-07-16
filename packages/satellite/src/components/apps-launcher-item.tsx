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
import Link from 'next/link';
import type { AppOpenMode } from './apps-launcher-catalog';

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

export const APP_LAUNCHER_CATEGORY_TONES: Record<
  LaunchableAppCategory,
  { dot: string; icon: string }
> = {
  ai: {
    dot: 'bg-dynamic-cyan',
    icon: 'border-dynamic-cyan/40 bg-dynamic-cyan/10 text-dynamic-cyan',
  },
  learning: {
    dot: 'bg-dynamic-orange',
    icon: 'border-dynamic-orange/40 bg-dynamic-orange/10 text-dynamic-orange',
  },
  miscellaneous: {
    dot: 'bg-dynamic-red',
    icon: 'border-dynamic-red/40 bg-dynamic-red/10 text-dynamic-red',
  },
  operations: {
    dot: 'bg-dynamic-green',
    icon: 'border-dynamic-green/40 bg-dynamic-green/10 text-dynamic-green',
  },
  productivity: {
    dot: 'bg-dynamic-blue',
    icon: 'border-dynamic-blue/40 bg-dynamic-blue/10 text-dynamic-blue',
  },
};

export function AppLauncherItem({
  app,
  description,
  getAppUrl,
  onOpen,
  openMode,
  title,
}: {
  app: LaunchableApp;
  description: string;
  getAppUrl: (app: LaunchableApp) => string;
  onOpen: () => void;
  openMode: AppOpenMode;
  title: string;
}) {
  const Icon = APP_ICONS[app.slug] ?? Boxes;
  const tone = APP_LAUNCHER_CATEGORY_TONES[app.category];
  const href = getAppUrl(app);
  const descriptionId = `apps-launcher-description-${app.slug}`;

  return (
    <Link
      aria-describedby={descriptionId}
      aria-label={title}
      className="group flex min-h-24 w-full cursor-pointer items-start gap-3 overflow-hidden rounded-xl border border-border/70 bg-card/40 p-3 text-left text-card-foreground outline-none transition-[background-color,border-color,transform] duration-200 ease-out hover:-translate-y-px hover:border-foreground/20 hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      data-slot="app-card"
      href={href}
      onClick={onOpen}
      prefetch={false}
      rel={openMode === 'new-tab' ? 'noopener noreferrer' : undefined}
      target={openMode === 'new-tab' ? '_blank' : undefined}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg border shadow-xs transition-transform duration-200 ease-out group-hover:scale-105 group-focus-visible:scale-105 motion-reduce:transition-none',
          tone.icon
        )}
        data-slot="app-card-icon"
      >
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block truncate font-semibold text-sm tracking-tight"
          data-slot="app-card-title"
        >
          {title}
        </span>
        <span
          className="mt-1 line-clamp-2 block text-muted-foreground text-xs leading-relaxed"
          data-slot="app-card-description"
          id={descriptionId}
        >
          {description}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="mt-1 shrink-0 text-muted-foreground/50 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
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
