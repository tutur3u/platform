'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from '@tuturuuu/icons';
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
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AppCommandItem,
  EmptyState,
  NavigationCommandItem,
  WorkspaceCommandItem,
} from './command-launcher-items';
import {
  COMMAND_LAUNCHER_TABS,
  COMMAND_LAUNCHER_TABS_WITHOUT_TASKS,
  type CommandLauncherTab,
  CommandLauncherTabs,
  parseLauncherQuery,
} from './command-launcher-tabs';
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
  activeTab: CommandLauncherTab;
  onClose: () => void;
  query: string;
  setQuery: (query: string) => void;
};

export type GlobalCommandLauncherLabels = {
  apps: string;
  categories: string;
  all: string;
  actions: string;
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
  tasks: string;
  workspaces: string;
};

type CommandLauncherHostApp = LaunchableAppSlug | 'external';

export type GlobalCommandLauncherProps = {
  currentApp: CommandLauncherHostApp;
  currentWorkspaceId?: string | null;
  defaultTab?: CommandLauncherTab;
  enableTasks?: boolean;
  extraSections?:
    | ReactNode
    | ((context: CommandLauncherExtraSectionContext) => ReactNode);
  labels?: Partial<GlobalCommandLauncherLabels>;
  navItems?: readonly CommandLauncherNavItem[];
  onNavigate?: (url: string) => void;
  workspacePathResolver?: LaunchableAppWorkspacePathResolver;
};

export type LauncherWorkspace = InternalApiWorkspaceSummary &
  LaunchableWorkspace;
type WorkspaceSearchItem = LauncherWorkspace & {
  aliases: string[];
  keywords: string[];
  title: string;
};

const DEFAULT_LABELS: GlobalCommandLauncherLabels = {
  actions: 'Actions',
  all: 'All',
  apps: 'Apps',
  categories: 'Search category',
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
  tasks: 'Tasks',
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

const commandLauncherInstanceRegistry = new Map<
  CommandLauncherHostApp,
  symbol[]
>();

function registerCommandLauncherInstance(
  currentApp: CommandLauncherHostApp,
  instanceId: symbol
) {
  const instances = commandLauncherInstanceRegistry.get(currentApp) ?? [];
  commandLauncherInstanceRegistry.set(currentApp, [...instances, instanceId]);
}

function unregisterCommandLauncherInstance(
  currentApp: CommandLauncherHostApp,
  instanceId: symbol
) {
  const nextInstances = (
    commandLauncherInstanceRegistry.get(currentApp) ?? []
  ).filter((registeredId) => registeredId !== instanceId);

  if (nextInstances.length === 0) {
    commandLauncherInstanceRegistry.delete(currentApp);
    return;
  }

  commandLauncherInstanceRegistry.set(currentApp, nextInstances);
}

function isActiveCommandLauncherInstance(
  currentApp: CommandLauncherHostApp,
  instanceId: symbol
) {
  const instances = commandLauncherInstanceRegistry.get(currentApp) ?? [];
  return instances.at(-1) === instanceId;
}

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

  return (
    firstSegment === workspace.id ||
    (firstSegment === 'personal' && workspace.personal)
  );
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
  defaultTab = 'all',
  enableTasks = false,
  extraSections,
  labels: labelOverrides,
  navItems = [],
  onNavigate,
  workspacePathResolver,
}: GlobalCommandLauncherProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const hostTabs = enableTasks
    ? COMMAND_LAUNCHER_TABS
    : extraSections
      ? COMMAND_LAUNCHER_TABS_WITHOUT_TASKS
      : (['all'] as const);
  const availableTabs = hostTabs.filter(
    (tab) => tab !== 'navigation' || navItems.length > 0
  );
  const resolvedDefaultTab = availableTabs.includes(defaultTab)
    ? defaultTab
    : 'all';
  const instanceId = useMemo(() => Symbol('GlobalCommandLauncher'), []);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] =
    useState<CommandLauncherTab>(resolvedDefaultTab);
  const parsedQuery = useMemo(() => parseLauncherQuery(query), [query]);
  const prefixedTab =
    parsedQuery.tab && availableTabs.includes(parsedQuery.tab)
      ? parsedQuery.tab
      : null;
  const routedTab = prefixedTab ?? activeTab;
  const trimmedQuery = trimQuery(parsedQuery.query);
  const deferredWorkspaceQuery = useDeferredValue(trimmedQuery);
  const showApps = routedTab === 'all' || routedTab === 'apps';

  const closeLauncher = useCallback(() => setOpen(false), []);

  useEffect(() => {
    registerCommandLauncherInstance(currentApp, instanceId);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isActiveCommandLauncherInstance(currentApp, instanceId)) return;
      if (event.isComposing) return;

      if (
        !event.repeat &&
        event.key.toLowerCase() === 'k' &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        setOpen((current) => !current);
      }
    };

    const onCommandLauncherEvent = (event: Event) => {
      if (!isActiveCommandLauncherInstance(currentApp, instanceId)) return;

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
      unregisterCommandLauncherInstance(currentApp, instanceId);
    };
  }, [currentApp, instanceId]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveTab(resolvedDefaultTab);
    }
  }, [open, resolvedDefaultTab]);

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
      enabled: open && showApps && deferredWorkspaceQuery.length > 0,
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

  const navigateTo = useCallback(
    (url: string, options: { newTab?: boolean } = {}) => {
      closeLauncher();

      if (options.newTab && !onNavigate) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }

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

      navigateTo(url, { newTab: app.slug === 'pay' });
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
          activeTab: routedTab,
          onClose: closeLauncher,
          query: parsedQuery.query,
          setQuery,
        })
      : extraSections;

  const showNavigation = routedTab === 'all' || routedTab === 'navigation';
  const showExtraSections =
    routedTab === 'tasks' || routedTab === 'all' || routedTab === 'actions';
  const currentAppTitle =
    LAUNCHABLE_APPS.find((app) => app.slug === currentApp)?.title ??
    labels.title;
  const activeTabLabel =
    routedTab === 'navigation' ? labels.navigation : labels[routedTab];

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const nextTab = availableTabs[Number(event.key) - 1];
    if (!nextTab) return;
    event.preventDefault();
    setActiveTab(nextTab);
    if (parsedQuery.tab) setQuery(parsedQuery.query);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        aria-label={labels.title}
        className="grid h-[min(820px,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] w-[min(1040px,96vw)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-xl border-border/70 bg-background/95 p-0 shadow-2xl backdrop-blur-xl sm:max-w-[min(1040px,96vw)]"
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
            <div className="flex items-center justify-between gap-4 border-b bg-muted/15 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-semibold text-sm">
                    {labels.title}
                  </h2>
                  {availableTabs.length > 1 ? (
                    <Badge
                      className="h-5 px-1.5 text-[10px]"
                      variant="secondary"
                    >
                      {activeTabLabel}
                    </Badge>
                  ) : null}
                </div>
                <p className="truncate text-muted-foreground text-xs">
                  {currentWorkspace?.name ?? currentAppTitle}
                </p>
              </div>
              <kbd className="hidden rounded-md border bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground shadow-xs sm:block">
                ⌘/Ctrl K
              </kbd>
            </div>
            <div className="border-b">
              <CommandInput
                aria-label={labels.title}
                autoFocus
                className="h-14 text-base"
                onKeyDown={handleInputKeyDown}
                onValueChange={setQuery}
                placeholder={labels.placeholder}
                value={query}
              />
            </div>

            {availableTabs.length > 1 ? (
              <CommandLauncherTabs
                activeTab={routedTab}
                ariaLabel={labels.categories}
                availableTabs={availableTabs}
                labels={{
                  actions: labels.actions,
                  all: labels.all,
                  apps: labels.apps,
                  navigation: labels.navigation,
                  tasks: labels.tasks,
                }}
                onChange={(tab) => {
                  setActiveTab(tab);
                  if (parsedQuery.tab) setQuery(parsedQuery.query);
                }}
              />
            ) : null}

            <CommandList className="max-h-none min-h-0 flex-1 overflow-y-auto p-2">
              <CommandEmpty>
                <EmptyState labels={labels} query={trimmedQuery} />
              </CommandEmpty>

              {showExtraSections ? renderedExtraSections : null}

              {showApps && appResults.length > 0 && (
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

              {showApps &&
                (isLoadingWorkspaces ||
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

              {showNavigation && navigationResults.length > 0 && (
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
            </CommandList>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
