'use client';

import { AlertTriangle, Loader2, RotateCw, WifiOff } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
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
} from './command-launcher-types';

interface CommandLauncherResultsProps {
  appResults: IntentSearchResult<LaunchableApp>[];
  currentApp: string;
  currentWorkspaceId?: string | null;
  extraSections: ReactNode;
  fallbackSection: ReactNode;
  isLoadingWorkspaces: boolean;
  isOffline: boolean;
  isSearchingWorkspaces: boolean;
  labels: GlobalCommandLauncherLabels;
  navigationResults: IntentSearchResult<CommandLauncherNavItem>[];
  onOpenApp: (app: LaunchableApp) => void;
  onOpenNavigation: (item: CommandLauncherNavItem) => void;
  onOpenWorkspace: (workspace: LauncherWorkspace) => void;
  onRetryWorkspaces: () => void;
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
  fallbackSection,
  isLoadingWorkspaces,
  isOffline,
  isSearchingWorkspaces,
  labels,
  navigationResults,
  onOpenApp,
  onOpenNavigation,
  onOpenWorkspace,
  onRetryWorkspaces,
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
              query={query}
            />
          ))}
        </CommandGroup>
      ) : null}
      {showApps &&
      (isLoadingWorkspaces ||
        isSearchingWorkspaces ||
        workspaceError ||
        workspaceResults.length > 0) ? (
        <CommandGroup
          heading={
            <SectionHeading
              busy={isSearchingWorkspaces && !isLoadingWorkspaces}
              busyLabel={labels.searchingWorkspaces}
              label={labels.workspaces}
            />
          }
        >
          {isLoadingWorkspaces ? (
            <CommandItem disabled value="loading-workspaces">
              <Loader2 className="size-4 animate-spin" />
              <span>{labels.loadingWorkspaces}</span>
            </CommandItem>
          ) : null}
          {workspaceError ? (
            <RemoteErrorRow
              label={isOffline ? labels.offline : labels.errorWorkspaces}
              offline={isOffline}
              onRetry={onRetryWorkspaces}
              retryLabel={labels.retry}
            />
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
              query={query}
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
              query={query}
            />
          ))}
        </CommandGroup>
      ) : null}
      {fallbackSection}
    </>
  );
}

function SectionHeading({
  busy,
  busyLabel,
  label,
}: {
  busy: boolean;
  busyLabel: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-2">
      {label}
      {busy ? (
        <span className="ml-auto flex items-center" role="status">
          <Loader2 aria-hidden="true" className="size-3 animate-spin" />
          <span className="sr-only">{busyLabel}</span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * A failed remote source stays inside its own section; local sections keep
 * rendering. Retry is a keyboard-selectable row, not a separate focus stop.
 */
function RemoteErrorRow({
  label,
  offline,
  onRetry,
  retryLabel,
}: {
  label: string;
  offline: boolean;
  onRetry: () => void;
  retryLabel: string;
}) {
  return (
    <CommandItem
      className="min-h-10 gap-2.5 rounded-lg border border-dashed px-2.5 text-muted-foreground"
      disabled={offline}
      onSelect={onRetry}
      value="workspace-error"
    >
      {offline ? (
        <WifiOff className="size-4" />
      ) : (
        <AlertTriangle className="size-4 text-dynamic-red" />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {offline ? null : (
        <Button
          className="h-7 gap-1.5"
          onClick={(event) => {
            event.stopPropagation();
            onRetry();
          }}
          size="sm"
          tabIndex={-1}
          type="button"
          variant="outline"
        >
          <RotateCw className="size-3.5" />
          {retryLabel}
        </Button>
      )}
    </CommandItem>
  );
}
