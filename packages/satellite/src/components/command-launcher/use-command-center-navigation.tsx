'use client';

import {
  Copy,
  ExternalLink,
  Link2,
  ListTodo,
  Sparkles,
} from '@tuturuuu/icons';
import {
  LAUNCHABLE_APPS,
  type LaunchableApp,
  type LaunchableAppWorkspacePathResolver,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';
import type { IntentSearchResult } from '@tuturuuu/utils/search';
import { type ReactNode, useCallback, useMemo } from 'react';
import type { CommandCenterFallbackItem } from './command-center-fallback-section';
import {
  buildAskMiraIntentUrl,
  buildCreateTaskIntentUrl,
} from './command-center-intents';
import type { ResolvedRecent } from './command-center-recent-section';
import { recordCommandCenterRecent } from './command-center-recents';
import type {
  CommandLauncherFallbackActions,
  CommandLauncherNavItem,
  GlobalCommandLauncherLabels,
  LauncherWorkspace,
} from './command-launcher-types';
import {
  type CommandLauncherHostApp,
  commandItemValue,
  type WorkspaceSearchItem,
} from './command-launcher-utils';

export type CommandItemAction = {
  icon: ReactNode;
  id: string;
  label: string;
  run: () => void;
};

/** Keyboard-reachable behavior for one built-in result row. */
export type CommandItemEntry = {
  actions: readonly CommandItemAction[];
  open: (options?: { newTab?: boolean }) => void;
  title: string;
};

function currentOrigin() {
  return typeof window === 'undefined' ? undefined : window.location.origin;
}

function absoluteUrl(url: string) {
  if (typeof window === 'undefined') return url;
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

function copyText(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
}

export function useCommandCenterNavigation({
  actorId,
  appResults,
  currentApp,
  currentWorkspace,
  fallbackActions,
  labels,
  navigationResults,
  onClose,
  onNavigate,
  query,
  recents,
  workspacePathResolver,
  workspaceResults,
}: {
  actorId: string | null;
  appResults: IntentSearchResult<LaunchableApp>[];
  currentApp: CommandLauncherHostApp;
  currentWorkspace: LauncherWorkspace | null;
  /** Null hides follow-ups (anonymous or scope without them). */
  fallbackActions: CommandLauncherFallbackActions | null;
  labels: GlobalCommandLauncherLabels;
  navigationResults: IntentSearchResult<CommandLauncherNavItem>[];
  onClose: () => void;
  onNavigate?: (url: string) => void;
  query: string;
  recents: readonly ResolvedRecent[];
  workspacePathResolver?: LaunchableAppWorkspacePathResolver;
  workspaceResults: IntentSearchResult<WorkspaceSearchItem>[];
}) {
  const navigateTo = useCallback(
    (url: string, options: { newTab?: boolean } = {}) => {
      onClose();

      if (options.newTab) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }

      if (onNavigate) {
        onNavigate(url);
        return;
      }

      window.location.assign(url);
    },
    [onClose, onNavigate]
  );

  const appUrl = useCallback(
    (app: LaunchableApp) =>
      resolveLaunchableAppUrl({
        app,
        currentOrigin: currentOrigin(),
        searchParams: { source: 'command-launcher' },
        workspace: currentWorkspace,
      }),
    [currentWorkspace]
  );

  const workspaceUrl = useCallback(
    (workspace: LauncherWorkspace) => {
      const app =
        LAUNCHABLE_APPS.find(
          (launchableApp) => launchableApp.slug === currentApp
        ) ?? LAUNCHABLE_APPS[0];
      return resolveLaunchableAppUrl({
        app,
        currentOrigin: currentOrigin(),
        searchParams: { source: 'command-launcher' },
        workspace,
        workspacePathResolver,
      });
    },
    [currentApp, workspacePathResolver]
  );

  const openApp = useCallback(
    (app: LaunchableApp, options: { newTab?: boolean } = {}) => {
      recordCommandCenterRecent(actorId, { id: app.slug, kind: 'app' });
      // Pay opens beside the current app unless the host handles navigation.
      navigateTo(appUrl(app), {
        newTab: options.newTab || (app.slug === 'pay' && !onNavigate),
      });
    },
    [actorId, appUrl, navigateTo, onNavigate]
  );

  const openWorkspace = useCallback(
    (workspace: LauncherWorkspace, options: { newTab?: boolean } = {}) => {
      recordCommandCenterRecent(actorId, {
        id: workspace.id,
        kind: 'workspace',
      });
      navigateTo(workspaceUrl(workspace), options);
    },
    [actorId, navigateTo, workspaceUrl]
  );

  const openNavItem = useCallback(
    (item: CommandLauncherNavItem, options: { newTab?: boolean } = {}) => {
      recordCommandCenterRecent(actorId, { id: item.href, kind: 'navigation' });
      navigateTo(item.href, options);
    },
    [actorId, navigateTo]
  );

  const openRecent = useCallback(
    (recent: ResolvedRecent, options: { newTab?: boolean } = {}) => {
      if (recent.kind === 'app') openApp(recent.app, options);
      else if (recent.kind === 'navigation') openNavItem(recent.item, options);
      else openWorkspace(recent.workspace, options);
    },
    [openApp, openNavItem, openWorkspace]
  );

  // Follow-ups hand the typed query to an existing composer as a draft:
  // the Tasks composer and Mira, both in the current workspace.
  const fallbackItems = useMemo<CommandCenterFallbackItem[]>(() => {
    if (!fallbackActions || !query) return [];
    const items: CommandCenterFallbackItem[] = [];
    const intent = {
      currentOrigin: currentOrigin(),
      query,
      workspace: currentWorkspace,
    };
    const createTaskUrl =
      fallbackActions.createTask !== false
        ? buildCreateTaskIntentUrl(intent)
        : null;
    if (createTaskUrl) {
      items.push({
        description: labels.createTaskDescription,
        icon: <ListTodo className="size-4" />,
        id: 'create-task',
        onSelect: () => navigateTo(createTaskUrl),
        title: labels.createTask,
        value: 'fallback-create-task',
      });
    }
    const askMiraUrl =
      fallbackActions.askMira !== false ? buildAskMiraIntentUrl(intent) : null;
    if (askMiraUrl) {
      items.push({
        description: labels.askMiraDescription,
        icon: <Sparkles className="size-4" />,
        id: 'ask-mira',
        onSelect: () => navigateTo(askMiraUrl),
        title: labels.askMira,
        value: 'fallback-ask-mira',
      });
    }
    return items;
  }, [currentWorkspace, fallbackActions, labels, navigateTo, query]);

  const entries = useMemo(() => {
    const map = new Map<string, CommandItemEntry>();
    const linkActions = (
      key: string,
      url: () => string,
      open: (options?: { newTab?: boolean }) => void,
      extra: CommandItemAction[] = []
    ): CommandItemAction[] => [
      {
        icon: <ExternalLink className="size-4" />,
        id: `${key}-new-tab`,
        label: labels.openInNewTab,
        run: () => open({ newTab: true }),
      },
      {
        icon: <Link2 className="size-4" />,
        id: `${key}-copy-link`,
        label: labels.copyLink,
        run: () => copyText(absoluteUrl(url())),
      },
      ...extra,
    ];

    for (const { item: app } of appResults) {
      const open = (options?: { newTab?: boolean }) => openApp(app, options);
      map.set(commandItemValue.app(app), {
        actions: linkActions(`app-${app.slug}`, () => appUrl(app), open),
        open,
        title: app.title,
      });
    }
    for (const { item: workspace } of workspaceResults) {
      const open = (options?: { newTab?: boolean }) =>
        openWorkspace(workspace, options);
      map.set(commandItemValue.workspace(workspace), {
        actions: linkActions(
          `workspace-${workspace.id}`,
          () => workspaceUrl(workspace),
          open,
          [
            {
              icon: <Copy className="size-4" />,
              id: `workspace-${workspace.id}-copy-id`,
              label: labels.copyId,
              run: () => copyText(workspace.id),
            },
          ]
        ),
        open,
        title: workspace.title,
      });
    }
    for (const { item } of navigationResults) {
      const open = (options?: { newTab?: boolean }) =>
        openNavItem(item, options);
      map.set(commandItemValue.navigation(item), {
        actions: linkActions(`nav-${item.href}`, () => item.href, open),
        open,
        title: item.title,
      });
    }
    for (const recent of recents) {
      const open = (options?: { newTab?: boolean }) =>
        openRecent(recent, options);
      const url = () =>
        recent.kind === 'app'
          ? appUrl(recent.app)
          : recent.kind === 'navigation'
            ? recent.item.href
            : workspaceUrl(recent.workspace);
      map.set(recent.value, {
        actions: linkActions(recent.value, url, open),
        open,
        title:
          recent.kind === 'app'
            ? recent.app.title
            : recent.kind === 'navigation'
              ? recent.item.title
              : recent.workspace.name || recent.workspace.id,
      });
    }
    return map;
  }, [
    appResults,
    appUrl,
    labels.copyId,
    labels.copyLink,
    labels.openInNewTab,
    navigationResults,
    openApp,
    openNavItem,
    openRecent,
    openWorkspace,
    recents,
    workspaceResults,
    workspaceUrl,
  ]);

  return {
    entries,
    fallbackItems,
    openApp,
    openNavItem,
    openRecent,
    openWorkspace,
  };
}
