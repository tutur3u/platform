'use client';

import { useQueries, useQuery } from '@tanstack/react-query';
import {
  getWorkspaceUser,
  listWorkspaceBasicUsers,
  type WorkspaceBasicUserRecord,
} from '@tuturuuu/internal-api';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import { useMemo } from 'react';

/** Results per search; the picker narrows further as the operator types. */
export const WORKSPACE_USER_SEARCH_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_STALE_MS = 60_000;

export const workspaceUserSearchQueryKey = (wsId: string, q: string) =>
  ['topic-announcement-workspace-user-search', wsId, q] as const;

/**
 * Server-side workspace user search (name/email). Replaces loading a fixed
 * first page of users, so large workspaces can pick any user.
 */
export function useWorkspaceUserSearch(wsId: string, query: string) {
  const [debounced] = useDebounce(query.trim(), SEARCH_DEBOUNCE_MS);
  return useQuery({
    queryFn: () =>
      listWorkspaceBasicUsers(wsId, {
        limit: WORKSPACE_USER_SEARCH_LIMIT,
        q: debounced || undefined,
      }),
    queryKey: workspaceUserSearchQueryKey(wsId, debounced),
    select: (response) => response.data,
    staleTime: SEARCH_STALE_MS,
  });
}

/** Loads one workspace user, e.g. the selected teacher outside the results. */
export function useWorkspaceUser(wsId: string, userId: string | null) {
  return useQuery({
    enabled: Boolean(userId),
    queryFn: () => getWorkspaceUser(wsId, userId as string),
    queryKey: ['topic-announcement-workspace-user', wsId, userId],
    staleTime: SEARCH_STALE_MS,
  });
}

/**
 * Searches the workspace for each distinct name (e.g. the teacher column of an
 * imported schedule). Returns candidate users per name, the loading state, and
 * whether any lookup failed. Matching the candidates is left to the caller.
 */
export function useWorkspaceUsersByNames(wsId: string, names: string[]) {
  const distinct = [...new Set(names.map((name) => name.trim()))]
    .filter(Boolean)
    .sort();
  const results = useQueries({
    queries: distinct.map((name) => ({
      queryFn: () =>
        listWorkspaceBasicUsers(wsId, {
          limit: WORKSPACE_USER_SEARCH_LIMIT,
          q: name,
        }),
      queryKey: workspaceUserSearchQueryKey(wsId, name),
      staleTime: SEARCH_STALE_MS,
    })),
  });

  const dataKey = results.map((result) => result.dataUpdatedAt).join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataKey tracks every result's data.
  const candidatesByName = useMemo(() => {
    const map = new Map<string, WorkspaceBasicUserRecord[]>();
    distinct.forEach((name, index) => {
      map.set(name, results[index]?.data?.data ?? []);
    });
    return map;
  }, [dataKey, distinct.join('\n')]);
  return {
    candidatesByName,
    isError: results.some((result) => result.isError),
    isLoading: results.some((result) => result.isLoading),
  };
}
