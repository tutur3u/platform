'use client';

import { useQuery } from '@tanstack/react-query';
import { listWorkspaces } from '@tuturuuu/internal-api';
import { searchIntent } from '@tuturuuu/utils/search';
import { useDeferredValue, useMemo } from 'react';
import {
  APP_SEARCH_ITEMS,
  isWorkspaceCurrent,
  mergeWorkspaces,
  REMOTE_WORKSPACE_SEARCH_LIMIT,
  VISIBLE_WORKSPACE_SEARCH_LIMIT,
  workspaceToSearchItem,
} from './command-launcher-utils';
import type {
  CommandLauncherNavItem,
  LauncherWorkspace,
} from './global-command-launcher';

export function useCommandLauncherResults({
  currentWorkspaceId,
  navItems,
  open,
  pathname,
  query,
  showApps,
}: {
  currentWorkspaceId?: string | null;
  navItems: readonly CommandLauncherNavItem[];
  open: boolean;
  pathname: string | null;
  query: string;
  showApps: boolean;
}) {
  const deferredWorkspaceQuery = useDeferredValue(query);
  const workspaceQuery = useQuery({
    enabled: open,
    queryFn: () => listWorkspaces(),
    queryKey: ['global-command-launcher', 'workspaces'],
    retry: false,
    staleTime: 60_000,
  });
  const remoteWorkspaceQuery = useQuery({
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

  const launcherWorkspaces = workspaceQuery.data as
    | LauncherWorkspace[]
    | undefined;
  const searchableWorkspaces = useMemo(
    () =>
      mergeWorkspaces(
        launcherWorkspaces ?? [],
        (remoteWorkspaceQuery.data ?? []) as LauncherWorkspace[]
      ),
    [launcherWorkspaces, remoteWorkspaceQuery.data]
  );
  const currentWorkspace = useMemo(
    () =>
      launcherWorkspaces?.find((workspace) =>
        isWorkspaceCurrent(workspace, currentWorkspaceId, pathname)
      ) ?? null,
    [currentWorkspaceId, launcherWorkspaces, pathname]
  );
  const appResults = useMemo(
    () => searchIntent(APP_SEARCH_ITEMS, query, { limit: query ? 8 : 12 }),
    [query]
  );
  const workspaceResults = useMemo(
    () =>
      searchIntent(searchableWorkspaces.map(workspaceToSearchItem), query, {
        limit: query ? VISIBLE_WORKSPACE_SEARCH_LIMIT : 10,
      }),
    [query, searchableWorkspaces]
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
        query,
        { limit: query ? 10 : 6 }
      ),
    [navItems, query]
  );

  return {
    appResults,
    currentWorkspace,
    isLoadingWorkspaces: workspaceQuery.isLoading,
    isSearchingWorkspaces: remoteWorkspaceQuery.isFetching,
    navigationResults,
    workspaceError: workspaceQuery.error,
    workspaceResults,
  };
}
