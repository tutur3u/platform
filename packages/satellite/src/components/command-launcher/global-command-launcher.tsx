'use client';

import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { Dialog } from '@tuturuuu/ui/dialog';
import {
  LAUNCHABLE_APPS,
  type LaunchableApp,
  type LaunchableAppWorkspacePathResolver,
  type LaunchableWorkspace,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';
import { usePathname } from 'next/navigation';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { CommandLauncherChrome } from './command-launcher-chrome';
import { CommandLauncherResults } from './command-launcher-results';
import {
  COMMAND_LAUNCHER_TABS,
  COMMAND_LAUNCHER_TABS_WITHOUT_TASKS,
  type CommandLauncherTab,
  parseLauncherQuery,
} from './command-launcher-tabs';
import {
  type CommandLauncherHostApp,
  isActiveLauncherInstance,
  registerLauncherInstance,
  unregisterLauncherInstance,
} from './command-launcher-utils';
import {
  GLOBAL_COMMAND_LAUNCHER_EVENT,
  type GlobalCommandLauncherEvent,
} from './events';
import { useCommandLauncherResults } from './use-command-launcher-results';

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
  isOpen: boolean;
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

export type GlobalCommandLauncherProps = {
  currentApp: CommandLauncherHostApp;
  currentWorkspaceId?: string | null;
  defaultTab?: CommandLauncherTab;
  enableTasks?: boolean;
  extraSections?:
    | ReactNode
    | ((context: CommandLauncherExtraSectionContext) => ReactNode);
  labels?: Partial<GlobalCommandLauncherLabels>;
  instancePriority?: number;
  navItems?: readonly CommandLauncherNavItem[];
  onNavigate?: (url: string) => void;
  workspacePathResolver?: LaunchableAppWorkspacePathResolver;
};

export type LauncherWorkspace = InternalApiWorkspaceSummary &
  LaunchableWorkspace;

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

export function GlobalCommandLauncher({
  currentApp,
  currentWorkspaceId,
  defaultTab = 'all',
  enableTasks = false,
  extraSections,
  instancePriority = 0,
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
  const trimmedQuery = parsedQuery.query.trim();
  const showApps = routedTab === 'all' || routedTab === 'apps';

  const closeLauncher = useCallback(() => setOpen(false), []);

  useEffect(() => {
    registerLauncherInstance(currentApp, instanceId, instancePriority);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isActiveLauncherInstance(currentApp, instanceId)) return;
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
      if (!isActiveLauncherInstance(currentApp, instanceId)) return;

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
      unregisterLauncherInstance(currentApp, instanceId);
    };
  }, [currentApp, instanceId, instancePriority]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveTab(resolvedDefaultTab);
    }
  }, [open, resolvedDefaultTab]);

  const {
    appResults,
    currentWorkspace,
    isLoadingWorkspaces,
    isSearchingWorkspaces,
    navigationResults,
    workspaceError,
    workspaceResults,
  } = useCommandLauncherResults({
    currentWorkspaceId,
    navItems,
    open,
    pathname,
    query: trimmedQuery,
    showApps,
  });

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
          isOpen: open,
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
      <CommandLauncherChrome
        activeTab={routedTab}
        availableTabs={availableTabs}
        contextLabel={currentWorkspace?.name ?? currentAppTitle}
        labels={labels}
        onInputKeyDown={handleInputKeyDown}
        onQueryChange={setQuery}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (parsedQuery.tab) setQuery(parsedQuery.query);
        }}
        query={query}
      >
        <CommandLauncherResults
          appResults={appResults}
          currentApp={currentApp}
          currentWorkspaceId={currentWorkspaceId}
          extraSections={showExtraSections ? renderedExtraSections : null}
          isLoadingWorkspaces={isLoadingWorkspaces}
          isSearchingWorkspaces={isSearchingWorkspaces}
          labels={labels}
          navigationResults={navigationResults}
          onOpenApp={openApp}
          onOpenNavigation={openNavItem}
          onOpenWorkspace={openWorkspace}
          pathname={pathname}
          query={trimmedQuery}
          showApps={showApps}
          showNavigation={showNavigation}
          workspaceError={workspaceError}
          workspaceResults={workspaceResults}
        />
      </CommandLauncherChrome>
    </Dialog>
  );
}
