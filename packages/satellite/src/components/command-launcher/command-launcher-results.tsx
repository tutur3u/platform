'use client';

import { Loader2, Search } from '@tuturuuu/icons';
import { CommandEmpty, CommandGroup, CommandItem } from '@tuturuuu/ui/command';
import type { LaunchableApp } from '@tuturuuu/utils/launchable-apps';
import type { IntentSearchResult } from '@tuturuuu/utils/search';
import type { ReactNode } from 'react';
import {
  AppCommandItem,
  EmptyState,
  NavigationCommandItem,
  WorkspaceCommandItem,
} from './command-launcher-items';
import {
  getMatchContext,
  isWorkspaceCurrent,
  type WorkspaceSearchItem,
} from './command-launcher-utils';
import type {
  CommandLauncherNavItem,
  GlobalCommandLauncherLabels,
  LauncherWorkspace,
} from './global-command-launcher';

interface CommandLauncherResultsProps {
  appResults: IntentSearchResult<LaunchableApp>[];
  currentApp: string;
  currentWorkspaceId?: string | null;
  extraSections: ReactNode;
  isLoadingWorkspaces: boolean;
  isSearchingWorkspaces: boolean;
  labels: GlobalCommandLauncherLabels;
  navigationResults: IntentSearchResult<CommandLauncherNavItem>[];
  onOpenApp: (app: LaunchableApp) => void;
  onOpenNavigation: (item: CommandLauncherNavItem) => void;
  onOpenWorkspace: (workspace: LauncherWorkspace) => void;
  pathname: string | null;
  query: string;
  showApps: boolean;
  showNavigation: boolean;
  workspaceError: Error | null;
  workspaceResults: IntentSearchResult<WorkspaceSearchItem>[];
}

export function CommandLauncherResults({
  appResults,
  currentApp,
  currentWorkspaceId,
  extraSections,
  isLoadingWorkspaces,
  isSearchingWorkspaces,
  labels,
  navigationResults,
  onOpenApp,
  onOpenNavigation,
  onOpenWorkspace,
  pathname,
  query,
  showApps,
  showNavigation,
  workspaceError,
  workspaceResults,
}: CommandLauncherResultsProps) {
  return (
    <>
      <CommandEmpty>
        <EmptyState labels={labels} query={query} />
      </CommandEmpty>
      {extraSections}
      {showApps && appResults.length > 0 ? (
        <CommandGroup heading={labels.apps}>
          {appResults.map((result) => (
            <AppCommandItem
              app={result.item}
              isCurrent={result.item.slug === currentApp}
              key={result.item.slug}
              labels={labels}
              matchContext={getMatchContext(result, labels)}
              onSelect={() => onOpenApp(result.item)}
            />
          ))}
        </CommandGroup>
      ) : null}
      {showApps &&
      (isLoadingWorkspaces ||
        isSearchingWorkspaces ||
        workspaceError ||
        workspaceResults.length > 0) ? (
        <CommandGroup heading={labels.workspaces}>
          {isLoadingWorkspaces || isSearchingWorkspaces ? (
            <CommandItem disabled value="loading-workspaces">
              <Loader2 className="size-4 animate-spin" />
              <span>{labels.loadingWorkspaces}</span>
            </CommandItem>
          ) : null}
          {workspaceError ? (
            <CommandItem disabled value="workspace-error">
              <Search className="size-4" />
              <span>{labels.errorWorkspaces}</span>
            </CommandItem>
          ) : null}
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
              onSelect={() => onOpenWorkspace(result.item)}
              workspace={result.item}
            />
          ))}
        </CommandGroup>
      ) : null}
      {showNavigation && navigationResults.length > 0 ? (
        <CommandGroup heading={labels.navigation}>
          {navigationResults.map((result) => (
            <NavigationCommandItem
              item={result.item}
              key={result.item.href}
              labels={labels}
              matchContext={getMatchContext(result, labels)}
              onSelect={() => onOpenNavigation(result.item)}
            />
          ))}
        </CommandGroup>
      ) : null}
    </>
  );
}
