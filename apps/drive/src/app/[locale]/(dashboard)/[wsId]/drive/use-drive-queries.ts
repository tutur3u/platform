'use client';

import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  getWorkspaceStorageAnalytics,
  listWorkspaceStorageObjects,
  type WorkspaceStorageAnalyticsResponse,
  type WorkspaceStorageListResponse,
} from '@tuturuuu/internal-api';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { useCallback } from 'react';
import { DRIVE_FETCH_PAGE_SIZE, type DriveSearchState } from './search-params';

export const driveAnalyticsQueryKey = (wsId: string) =>
  ['workspace-storage-analytics', wsId] as const;

export const driveDirectoryQueryKey = (
  wsId: string,
  searchState: Pick<DriveSearchState, 'path' | 'q' | 'sortBy' | 'sortOrder'>
) =>
  [
    'workspace-storage-directory',
    wsId,
    searchState.path,
    searchState.q,
    DRIVE_FETCH_PAGE_SIZE,
    searchState.sortBy,
    searchState.sortOrder,
  ] as const;

function normalizeDirectoryPayload(
  payload: InfiniteData<WorkspaceStorageListResponse, number>
) {
  const items = payload.pages.flatMap((page) => page.data) as StorageObject[];
  const latestPage = payload.pages.at(-1);

  return {
    items,
    total: latestPage?.pagination.total ?? 0,
    pageSize: latestPage?.pagination.limit ?? 0,
    offset: latestPage?.pagination.offset ?? 0,
  };
}

function normalizeAnalyticsPayload(payload: WorkspaceStorageAnalyticsResponse) {
  return payload.data;
}

function shouldKeepDirectoryPlaceholder(
  previousQuery: { queryKey: readonly unknown[] } | undefined,
  wsId: string,
  searchState: Pick<DriveSearchState, 'path' | 'q' | 'sortBy' | 'sortOrder'>,
  normalizedSearch: string
) {
  const queryKey = previousQuery?.queryKey;

  if (!Array.isArray(queryKey) || queryKey.length < 7) {
    return false;
  }

  const [
    scope,
    previousWsId,
    previousPath,
    previousSearch,
    previousPageSize,
    previousSortBy,
    previousSortOrder,
  ] = queryKey;

  return (
    scope === 'workspace-storage-directory' &&
    previousWsId === wsId &&
    previousPath === searchState.path &&
    previousSearch === normalizedSearch &&
    previousPageSize === DRIVE_FETCH_PAGE_SIZE &&
    previousSortBy === searchState.sortBy &&
    previousSortOrder === searchState.sortOrder
  );
}

export function useWorkspaceStorageDirectoryQuery(
  wsId: string,
  searchState: Pick<DriveSearchState, 'path' | 'q' | 'sortBy' | 'sortOrder'>
) {
  const normalizedSearch = searchState.q.trim();

  return useInfiniteQuery({
    queryKey: driveDirectoryQueryKey(wsId, {
      ...searchState,
      q: normalizedSearch,
    }),
    queryFn: async ({ pageParam }) =>
      listWorkspaceStorageObjects(
        wsId,
        {
          path: searchState.path || undefined,
          search: normalizedSearch || undefined,
          limit: DRIVE_FETCH_PAGE_SIZE,
          offset: pageParam,
          sortBy: searchState.sortBy,
          sortOrder: searchState.sortOrder,
        },
        { fetch }
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.pagination.offset + lastPage.pagination.limit;

      return nextOffset < lastPage.pagination.total ? nextOffset : undefined;
    },
    placeholderData: (previousData, previousQuery) =>
      shouldKeepDirectoryPlaceholder(
        previousQuery,
        wsId,
        searchState,
        normalizedSearch
      )
        ? previousData
        : undefined,
    select: normalizeDirectoryPayload,
  });
}

export function useWorkspaceStorageAnalyticsQuery(wsId: string) {
  return useQuery({
    queryKey: driveAnalyticsQueryKey(wsId),
    queryFn: () => getWorkspaceStorageAnalytics(wsId, { fetch }),
    select: normalizeAnalyticsPayload,
  });
}

export function useInvalidateDriveQueries(wsId: string) {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: driveAnalyticsQueryKey(wsId),
      }),
      queryClient.invalidateQueries({
        queryKey: ['workspace-storage-directory', wsId],
      }),
    ]);
  }, [queryClient, wsId]);
}
