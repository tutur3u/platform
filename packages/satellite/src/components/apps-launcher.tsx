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
import { cn } from '@tuturuuu/utils/format';
import type {
  LaunchableApp,
  LaunchableWorkspace,
} from '@tuturuuu/utils/launchable-apps';
import {
  LAUNCHABLE_APPS,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';
import { useTranslations } from 'next-intl';

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[min(720px,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] w-[min(720px,96vw)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-[min(720px,96vw)]">
        <DialogHeader className="border-b px-5 py-4 text-left">
          <DialogTitle>{t('apps')}</DialogTitle>
          <DialogDescription>{t('apps_description')}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {LAUNCHABLE_APPS.map((app) => (
              <AppLauncherItem
                app={app}
                key={app.slug}
                onOpen={openApp}
                openHereLabel={t('open_here')}
                openInNewTabLabel={t('open_in_new_tab')}
                openOptionsLabel={t('open_options')}
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

  return (
    <div className="group grid grid-cols-[minmax(0,1fr)_auto] items-stretch rounded-lg border bg-card text-card-foreground transition hover:bg-accent/60">
      <button
        aria-label={`${openInNewTabLabel}: ${app.title}`}
        className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-3 py-3 text-left"
        onClick={() => onOpen(app, 'new-tab')}
        type="button"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/70">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-sm">
            {app.title}
          </span>
          <span className="block truncate text-muted-foreground text-xs">
            {app.productionUrl}
          </span>
        </span>
      </button>

      <div className="flex items-center pr-2">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`${openOptionsLabel}: ${app.title}`}
              className={cn(
                'size-8 shrink-0 text-muted-foreground opacity-80 transition',
                'hover:text-foreground group-hover:opacity-100'
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
