import {
  ArrowRight,
  BookOpen,
  BookText,
  BookUser,
  Boxes,
  Brain,
  Calendar,
  CheckCircle2,
  ClipboardList,
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
  forms: ClipboardList,
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
      className="group relative flex min-h-36 w-full cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card/40 px-5 py-4 text-center text-card-foreground outline-none transition-[background-color,border-color,transform] duration-200 ease-out hover:-translate-y-px hover:border-foreground/20 hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      data-slot="app-card"
      href={href}
      onClick={onOpen}
      prefetch={false}
      rel={openMode === 'new-tab' ? 'noopener noreferrer' : undefined}
      target={openMode === 'new-tab' ? '_blank' : undefined}
    >
      <span
        className={cn(
          'flex size-14 shrink-0 items-center justify-center rounded-2xl border shadow-xs transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:scale-105 group-focus-visible:-translate-y-0.5 group-focus-visible:scale-105 motion-reduce:transition-none',
          tone.icon
        )}
        data-slot="app-card-icon"
      >
        <Icon className="size-7" />
      </span>
      <span className="flex w-full min-w-0 flex-col items-center">
        <span
          className="block max-w-full truncate font-semibold text-base tracking-tight"
          data-slot="app-card-title"
        >
          {title}
        </span>
        <span
          className="mt-1.5 line-clamp-2 block max-w-[34ch] text-center text-muted-foreground text-xs leading-relaxed"
          data-slot="app-card-description"
          id={descriptionId}
        >
          {description}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="absolute top-3 right-3 flex size-7 shrink-0 items-center justify-center rounded-full border border-transparent text-muted-foreground/70 opacity-60 transition-[background-color,border-color,color,opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:border-border/70 group-hover:bg-background/80 group-hover:text-foreground group-hover:opacity-100 group-focus-visible:border-border/70 group-focus-visible:bg-background/80 group-focus-visible:text-foreground group-focus-visible:opacity-100 motion-reduce:transition-none"
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
