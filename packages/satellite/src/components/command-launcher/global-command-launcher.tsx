'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Building2,
  Check,
  ExternalLink,
  Globe2,
  Loader2,
  PanelTop,
  Search,
  User,
} from '@tuturuuu/icons';
import { listWorkspaces } from '@tuturuuu/internal-api';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { cn } from '@tuturuuu/utils/format';
import {
  LAUNCHABLE_APPS,
  type LaunchableApp,
  type LaunchableAppSlug,
  type LaunchableAppWorkspacePathResolver,
  type LaunchableWorkspace,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';
import { type IntentSearchResult, searchIntent } from '@tuturuuu/utils/search';
import { usePathname } from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  GLOBAL_COMMAND_LAUNCHER_EVENT,
  type GlobalCommandLauncherEvent,
} from './events';

export type CommandLauncherNavItem = {
  aliases?: readonly string[];
  external?: boolean;
  group?: string;
  href: string;
  icon?: ReactNode;
  keywords?: readonly string[];
  subtitle?: string | null;
  title: string;
};

export type CommandLauncherExtraSectionContext = {
  onClose: () => void;
  query: string;
  setQuery: (query: string) => void;
};

export type GlobalCommandLauncherLabels = {
  apps: string;
  close: string;
  current: string;
  currentApp: string;
  currentWorkspace: string;
  empty: string;
  emptyDescription: string;
  errorWorkspaces: string;
  guest: string;
  loadingWorkspaces: string;
  match: string;
  navigate: string;
  navigation: string;
  open: string;
  openApp: string;
  openWorkspace: string;
  personal: string;
  placeholder: string;
  searchHint: string;
  select: string;
  title: string;
  workspaces: string;
};

export type GlobalCommandLauncherProps = {
  currentApp: LaunchableAppSlug;
  currentWorkspaceId?: string | null;
  extraSections?:
    | ReactNode
    | ((context: CommandLauncherExtraSectionContext) => ReactNode);
  labels?: Partial<GlobalCommandLauncherLabels>;
  navItems?: readonly CommandLauncherNavItem[];
  onNavigate?: (url: string) => void;
  workspacePathResolver?: LaunchableAppWorkspacePathResolver;
};

type LauncherWorkspace = InternalApiWorkspaceSummary & LaunchableWorkspace;
type WorkspaceSearchItem = LauncherWorkspace & {
  aliases: string[];
  keywords: string[];
  title: string;
};

type LauncherItem =
  | {
      app: LaunchableApp;
      result: IntentSearchResult<LaunchableApp>;
      type: 'app';
    }
  | {
      result: IntentSearchResult<CommandLauncherNavItem>;
      type: 'nav';
    }
  | {
      result: IntentSearchResult<WorkspaceSearchItem>;
      type: 'workspace';
      workspace: WorkspaceSearchItem;
    };

const DEFAULT_LABELS: GlobalCommandLauncherLabels = {
  apps: 'Apps',
  close: 'close',
  current: 'Current',
  currentApp: 'Current app',
  currentWorkspace: 'Current workspace',
  empty: 'No command found',
  emptyDescription: 'Try a workspace, app, page, or a closer spelling.',
  errorWorkspaces: 'Could not load workspaces',
  guest: 'Guest',
  loadingWorkspaces: 'Loading workspaces',
  match: 'Match',
  navigate: 'navigate',
  navigation: 'Navigation',
  open: 'Open',
  openApp: 'Open app',
  openWorkspace: 'Open workspace',
  personal: 'Personal',
  placeholder: 'Search apps, workspaces, and pages...',
  searchHint: 'Type a workspace, app, page, acronym, or close spelling.',
  select: 'select',
  title: 'Command Launcher',
  workspaces: 'Workspaces',
};

const APP_SEARCH_ITEMS: readonly LaunchableApp[] = LAUNCHABLE_APPS.map(
  (app) => ({
    ...app,
    keywords: [app.category, app.slug, app.packageName],
    subtitle: app.productionUrl,
  })
);
const REMOTE_WORKSPACE_SEARCH_LIMIT = 50;
const VISIBLE_WORKSPACE_SEARCH_LIMIT = 20;

function workspaceToSearchItem(
  workspace: LauncherWorkspace
): WorkspaceSearchItem {
  const accessType = 'access_type' in workspace ? workspace.access_type : null;

  return {
    ...workspace,
    aliases: [
      workspace.id,
      workspace.personal ? 'personal' : '',
      accessType === 'guest' ? 'guest' : '',
      workspace.guest_landing_path ?? '',
    ].filter(Boolean),
    keywords: [
      workspace.personal ? 'personal' : '',
      accessType === 'guest' ? 'guest' : '',
      workspace.created_by_me ? 'created by me' : '',
    ].filter(Boolean),
    title: workspace.name || workspace.id,
  };
}

function trimQuery(query: string) {
  return query.trim();
}

function isWorkspaceCurrent(
  workspace: LauncherWorkspace,
  currentWorkspaceId?: string | null,
  pathname?: string | null
) {
  if (workspace.id === currentWorkspaceId) return true;
  if (!pathname) return false;

  const firstSegment = pathname.split('/').filter(Boolean)[0];

  return firstSegment === workspace.id || firstSegment === 'personal';
}

function getWorkspaceAccessType(workspace: LauncherWorkspace) {
  return 'access_type' in workspace ? workspace.access_type : null;
}

function getMatchContext<T extends { title: string }>(
  result: IntentSearchResult<T>,
  labels: GlobalCommandLauncherLabels
) {
  if (result.reason === 'exact' || result.reason === 'prefix') return null;
  if (result.matchedText === result.item.title) return result.reason;

  return `${labels.match}: ${result.matchedText}`;
}

function mergeWorkspaces(
  localWorkspaces: readonly LauncherWorkspace[],
  remoteWorkspaces: readonly LauncherWorkspace[]
) {
  const byId = new Map<string, LauncherWorkspace>();

  for (const workspace of localWorkspaces) {
    byId.set(workspace.id, workspace);
  }

  for (const workspace of remoteWorkspaces) {
    byId.set(workspace.id, workspace);
  }

  return [...byId.values()];
}

export function GlobalCommandLauncher({
  currentApp,
  currentWorkspaceId,
  extraSections,
  labels: labelOverrides,
  navItems = [],
  onNavigate,
  workspacePathResolver,
}: GlobalCommandLauncherProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const trimmedQuery = trimQuery(query);
  const deferredWorkspaceQuery = useDeferredValue(trimmedQuery);

  const closeLauncher = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === 'k' &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(true);
      }
    };

    const onCommandLauncherEvent = (event: Event) => {
      const action = (event as GlobalCommandLauncherEvent).detail?.action;

      if (action === 'open') setOpen(true);
      if (action === 'close') setOpen(false);
      if (action === 'toggle') setOpen((current) => !current);
    };

    document.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener(
      GLOBAL_COMMAND_LAUNCHER_EVENT,
      onCommandLauncherEvent
    );

    return () => {
      document.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener(
        GLOBAL_COMMAND_LAUNCHER_EVENT,
        onCommandLauncherEvent
      );
    };
  }, []);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const {
    data: workspaces = [],
    error: workspaceError,
    isLoading: isLoadingWorkspaces,
  } = useQuery({
    enabled: open,
    queryFn: () => listWorkspaces(),
    queryKey: ['global-command-launcher', 'workspaces'],
    retry: false,
    staleTime: 60_000,
  });

  const launcherWorkspaces = workspaces as LauncherWorkspace[];
  const { data: remoteWorkspaces = [], isFetching: isSearchingWorkspaces } =
    useQuery({
      enabled: open && deferredWorkspaceQuery.length > 0,
      queryFn: () =>
        listWorkspaces({
          limit: REMOTE_WORKSPACE_SEARCH_LIMIT,
          q: deferredWorkspaceQuery,
        }),
      queryKey: [
        'global-command-launcher',
        'workspaces',
        'search',
        deferredWorkspaceQuery,
      ],
      retry: false,
      staleTime: 30_000,
    });
  const searchableWorkspaces = useMemo(
    () =>
      mergeWorkspaces(
        launcherWorkspaces,
        remoteWorkspaces as LauncherWorkspace[]
      ),
    [launcherWorkspaces, remoteWorkspaces]
  );
  const currentWorkspace = useMemo(
    () =>
      launcherWorkspaces.find((workspace) =>
        isWorkspaceCurrent(workspace, currentWorkspaceId, pathname)
      ) ?? null,
    [currentWorkspaceId, launcherWorkspaces, pathname]
  );

  const appResults = useMemo(
    () =>
      searchIntent(APP_SEARCH_ITEMS, trimmedQuery, {
        limit: trimmedQuery ? 8 : 12,
      }),
    [trimmedQuery]
  );
  const workspaceResults = useMemo(
    () =>
      searchIntent(
        searchableWorkspaces.map(workspaceToSearchItem),
        trimmedQuery,
        {
          limit: trimmedQuery ? VISIBLE_WORKSPACE_SEARCH_LIMIT : 10,
        }
      ),
    [searchableWorkspaces, trimmedQuery]
  );
  const navigationResults = useMemo(
    () =>
      searchIntent(
        navItems.map((item) => ({
          ...item,
          keywords: [
            ...(item.keywords ?? []),
            item.external ? 'external' : '',
            item.group ?? '',
          ].filter(Boolean),
        })),
        trimmedQuery,
        {
          limit: trimmedQuery ? 10 : 6,
        }
      ),
    [navItems, trimmedQuery]
  );

  const visibleItems: LauncherItem[] = [
    ...appResults.map((result) => ({
      app: result.item,
      result,
      type: 'app' as const,
    })),
    ...workspaceResults.map((result) => ({
      result,
      type: 'workspace' as const,
      workspace: result.item,
    })),
    ...navigationResults.map((result) => ({
      result,
      type: 'nav' as const,
    })),
  ];

  const hasResults = visibleItems.length > 0;

  const navigateTo = useCallback(
    (url: string) => {
      closeLauncher();

      if (onNavigate) {
        onNavigate(url);
        return;
      }

      window.location.assign(url);
    },
    [closeLauncher, onNavigate]
  );

  const openApp = useCallback(
    (app: LaunchableApp) => {
      const url = resolveLaunchableAppUrl({
        app,
        currentOrigin:
          typeof window === 'undefined' ? undefined : window.location.origin,
        searchParams: {
          source: 'command-launcher',
        },
        workspace: currentWorkspace,
      });

      navigateTo(url);
    },
    [currentWorkspace, navigateTo]
  );

  const openWorkspace = useCallback(
    (workspace: LauncherWorkspace) => {
      const app =
        LAUNCHABLE_APPS.find(
          (launchableApp) => launchableApp.slug === currentApp
        ) ?? LAUNCHABLE_APPS[0];
      const url = resolveLaunchableAppUrl({
        app,
        currentOrigin:
          typeof window === 'undefined' ? undefined : window.location.origin,
        searchParams: {
          source: 'command-launcher',
        },
        workspace,
        workspacePathResolver,
      });

      navigateTo(url);
    },
    [currentApp, navigateTo, workspacePathResolver]
  );

  const openNavItem = useCallback(
    (item: CommandLauncherNavItem) => {
      navigateTo(item.href);
    },
    [navigateTo]
  );

  const renderedExtraSections =
    typeof extraSections === 'function'
      ? extraSections({
          onClose: closeLauncher,
          query,
          setQuery,
        })
      : extraSections;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        aria-label={labels.title}
        className="grid h-[min(760px,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] w-[min(760px,96vw)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-lg border bg-background p-0 shadow-2xl sm:max-w-[min(760px,96vw)]"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.searchHint}</DialogDescription>
        </DialogHeader>
        <Command
          className="h-full min-h-0 rounded-none border-none bg-background"
          shouldFilter={false}
        >
          <div className="flex min-h-0 flex-col overflow-hidden">
            <div className="border-b">
              <CommandInput
                aria-label={labels.title}
                className="h-12"
                onValueChange={setQuery}
                placeholder={labels.placeholder}
                value={query}
              />
            </div>

            <CommandList className="max-h-none min-h-0 flex-1 overflow-y-auto p-2">
              <CommandEmpty>
                <EmptyState labels={labels} query={trimmedQuery} />
              </CommandEmpty>

              {appResults.length > 0 && (
                <CommandGroup heading={labels.apps}>
                  {appResults.map((result) => (
                    <AppCommandItem
                      app={result.item}
                      isCurrent={result.item.slug === currentApp}
                      key={result.item.slug}
                      labels={labels}
                      matchContext={getMatchContext(result, labels)}
                      onSelect={() => openApp(result.item)}
                    />
                  ))}
                </CommandGroup>
              )}

              {(isLoadingWorkspaces ||
                isSearchingWorkspaces ||
                workspaceError ||
                workspaceResults.length > 0) && (
                <CommandGroup heading={labels.workspaces}>
                  {(isLoadingWorkspaces || isSearchingWorkspaces) && (
                    <CommandItem disabled value="loading-workspaces">
                      <Loader2 className="size-4 animate-spin" />
                      <span>{labels.loadingWorkspaces}</span>
                    </CommandItem>
                  )}
                  {workspaceError && (
                    <CommandItem disabled value="workspace-error">
                      <Search className="size-4" />
                      <span>{labels.errorWorkspaces}</span>
                    </CommandItem>
                  )}
                  {workspaceResults.map((result) => (
                    <WorkspaceCommandItem
                      isCurrent={isWorkspaceCurrent(
                        result.item,
                        currentWorkspaceId,
                        pathname
                      )}
                      key={result.item.id}
                      labels={labels}
                      matchContext={getMatchContext(result, labels)}
                      onSelect={() => openWorkspace(result.item)}
                      workspace={result.item}
                    />
                  ))}
                </CommandGroup>
              )}

              {navigationResults.length > 0 && (
                <CommandGroup heading={labels.navigation}>
                  {navigationResults.map((result) => (
                    <NavigationCommandItem
                      item={result.item}
                      key={result.item.href}
                      labels={labels}
                      matchContext={getMatchContext(result, labels)}
                      onSelect={() => openNavItem(result.item)}
                    />
                  ))}
                </CommandGroup>
              )}

              {renderedExtraSections}

              {!hasResults &&
                !isLoadingWorkspaces &&
                !isSearchingWorkspaces && (
                  <div className="py-8">
                    <EmptyState labels={labels} query={trimmedQuery} />
                  </div>
                )}
            </CommandList>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function AppCommandItem({
  app,
  isCurrent,
  labels,
  matchContext,
  onSelect,
}: {
  app: LaunchableApp;
  isCurrent: boolean;
  labels: GlobalCommandLauncherLabels;
  matchContext: string | null;
  onSelect: () => void;
}) {
  return (
    <CommandItem
      className="min-h-13 rounded-md px-2"
      onSelect={onSelect}
      value={`app-${app.slug}-${app.title}`}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/60">
        <Globe2 className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{app.title}</span>
          {isCurrent && (
            <Badge
              className="h-5 rounded-md px-1.5 text-[10px]"
              variant="secondary"
            >
              {labels.current}
            </Badge>
          )}
        </div>
        <div className="truncate text-muted-foreground text-xs">
          {matchContext ?? app.productionUrl}
        </div>
      </div>
      <span className="hidden text-muted-foreground text-xs sm:inline">
        {labels.openApp}
      </span>
      <ArrowRight className="size-4" />
    </CommandItem>
  );
}

function WorkspaceCommandItem({
  isCurrent,
  labels,
  matchContext,
  onSelect,
  workspace,
}: {
  isCurrent: boolean;
  labels: GlobalCommandLauncherLabels;
  matchContext: string | null;
  onSelect: () => void;
  workspace: LauncherWorkspace;
}) {
  const accessType = getWorkspaceAccessType(workspace);

  return (
    <CommandItem
      className="min-h-13 rounded-md px-2"
      onSelect={onSelect}
      value={`workspace-${workspace.id}-${workspace.name}`}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/60">
        {workspace.personal ? (
          <User className="size-4" />
        ) : (
          <Building2 className="size-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">
            {workspace.name || workspace.id}
          </span>
          {isCurrent && <StatusBadge label={labels.current} />}
          {workspace.personal && <StatusBadge label={labels.personal} />}
          {accessType === 'guest' && <StatusBadge label={labels.guest} />}
        </div>
        <div className="truncate text-muted-foreground text-xs">
          {matchContext ?? workspace.id}
        </div>
      </div>
      <span className="hidden text-muted-foreground text-xs sm:inline">
        {labels.openWorkspace}
      </span>
      {isCurrent ? (
        <Check className="size-4" />
      ) : (
        <ArrowRight className="size-4" />
      )}
    </CommandItem>
  );
}

function NavigationCommandItem({
  item,
  labels,
  matchContext,
  onSelect,
}: {
  item: CommandLauncherNavItem;
  labels: GlobalCommandLauncherLabels;
  matchContext: string | null;
  onSelect: () => void;
}) {
  return (
    <CommandItem
      className="min-h-13 rounded-md px-2"
      onSelect={onSelect}
      value={`nav-${item.href}-${item.title}`}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/60">
        {item.icon ?? <PanelTop className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{item.title}</span>
          {item.external && (
            <ExternalLink className="size-3 text-muted-foreground" />
          )}
        </div>
        <div className="truncate text-muted-foreground text-xs">
          {matchContext ?? item.subtitle ?? item.href}
        </div>
      </div>
      <span className="hidden text-muted-foreground text-xs sm:inline">
        {labels.open}
      </span>
      <ArrowRight className="size-4" />
    </CommandItem>
  );
}

function EmptyState({
  labels,
  query,
}: {
  labels: GlobalCommandLauncherLabels;
  query: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-lg border bg-muted/60">
        <Search className="size-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{labels.empty}</p>
        <p className="text-muted-foreground text-sm">
          {query ? `"${query}"` : labels.emptyDescription}
        </p>
      </div>
    </div>
  );
}

function StatusBadge({ label }: { label: string }) {
  return (
    <Badge
      className={cn('h-5 rounded-md px-1.5 text-[10px]', 'uppercase')}
      variant="outline"
    >
      {label}
    </Badge>
  );
}
