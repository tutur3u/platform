'use client';

import { CommandGroup } from '@tuturuuu/ui/command';
import type { LaunchableApp } from '@tuturuuu/utils/launchable-apps';
import { useMemo } from 'react';
import {
  type CommandCenterRecent,
  readCommandCenterRecents,
} from './command-center-recents';
import {
  AppCommandItem,
  NavigationCommandItem,
  WorkspaceCommandItem,
} from './command-launcher-items';
import type {
  CommandLauncherNavItem,
  GlobalCommandLauncherLabels,
  LauncherWorkspace,
} from './command-launcher-types';
import { APP_SEARCH_ITEMS } from './command-launcher-utils';

export const RECENT_SECTION_LIMIT = 5;

export type ResolvedRecent =
  | { app: LaunchableApp; kind: 'app'; value: string }
  | { item: CommandLauncherNavItem; kind: 'navigation'; value: string }
  | { kind: 'workspace'; value: string; workspace: LauncherWorkspace };

/**
 * Keeps only recents that the host can show right now: catalog apps, pages in
 * the host's permission-filtered navigation, and workspaces in the visible
 * (non-Hidden) workspace list.
 */
export function resolveRecents(
  recents: readonly CommandCenterRecent[],
  {
    apps,
    navItems,
    workspaces,
  }: {
    apps: readonly LaunchableApp[];
    navItems: readonly CommandLauncherNavItem[];
    workspaces: readonly LauncherWorkspace[];
  }
): ResolvedRecent[] {
  const resolved: ResolvedRecent[] = [];
  for (const recent of recents) {
    const value = `recent-${recent.kind}-${recent.id}`;
    if (recent.kind === 'app') {
      const app = apps.find((candidate) => candidate.slug === recent.id);
      if (app) resolved.push({ app, kind: 'app', value });
    } else if (recent.kind === 'navigation') {
      const item = navItems.find((candidate) => candidate.href === recent.id);
      if (item) resolved.push({ item, kind: 'navigation', value });
    } else {
      const workspace = workspaces.find(
        (candidate) => candidate.id === recent.id
      );
      if (workspace) resolved.push({ kind: 'workspace', value, workspace });
    }
    if (resolved.length >= RECENT_SECTION_LIMIT) break;
  }
  return resolved;
}

const NO_RECENTS: ResolvedRecent[] = [];

/** Recent entries for an empty query in the All scope. */
export function useCommandCenterRecents({
  actorId,
  enabled,
  navItems,
  workspaces,
}: {
  actorId: string | null;
  enabled: boolean;
  navItems: readonly CommandLauncherNavItem[];
  workspaces: readonly LauncherWorkspace[];
}) {
  return useMemo(
    () =>
      enabled
        ? resolveRecents(readCommandCenterRecents(actorId), {
            apps: APP_SEARCH_ITEMS,
            navItems,
            workspaces,
          })
        : NO_RECENTS,
    [actorId, enabled, navItems, workspaces]
  );
}

export function CommandCenterRecentSection({
  currentApp,
  isCurrentWorkspace,
  labels,
  onOpen,
  recents,
}: {
  currentApp: string;
  isCurrentWorkspace: (workspace: LauncherWorkspace) => boolean;
  labels: GlobalCommandLauncherLabels;
  onOpen: (recent: ResolvedRecent) => void;
  recents: readonly ResolvedRecent[];
}) {
  if (recents.length === 0) return null;
  return (
    <CommandGroup heading={labels.recent}>
      {recents.map((recent) =>
        recent.kind === 'app' ? (
          <AppCommandItem
            app={recent.app}
            isCurrent={recent.app.slug === currentApp}
            key={recent.value}
            labels={labels}
            matchContext={null}
            onSelect={() => onOpen(recent)}
            value={recent.value}
          />
        ) : recent.kind === 'navigation' ? (
          <NavigationCommandItem
            item={recent.item}
            key={recent.value}
            labels={labels}
            matchContext={null}
            onSelect={() => onOpen(recent)}
            value={recent.value}
          />
        ) : (
          <WorkspaceCommandItem
            isCurrent={isCurrentWorkspace(recent.workspace)}
            key={recent.value}
            labels={labels}
            matchContext={null}
            onSelect={() => onOpen(recent)}
            value={recent.value}
            workspace={recent.workspace}
          />
        )
      )}
    </CommandGroup>
  );
}
