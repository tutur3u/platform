'use client';

import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { useTranslations } from 'next-intl';
import { useQueryStates } from 'nuqs';
import {
  startTransition,
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
} from 'react';
import { getPathSegments } from './drive-selection';
import {
  type DriveSortBy,
  type DriveViewMode,
  driveSearchParamParsers,
} from './search-params';
import { getStoragePathSegmentDisplayName } from './storage-display-name';
import { useDriveDeleteMutation } from './use-drive-delete-mutation';
import {
  useInvalidateDriveQueries,
  useWorkspaceStorageAnalyticsQuery,
  useWorkspaceStorageDirectoryQuery,
} from './use-drive-queries';
import { useDriveSelectionState } from './use-drive-selection-state';

export function useDriveExplorerController(wsId: string) {
  const t = useTranslations('ws-storage-objects');
  const [searchState, setSearchState] = useQueryStates(driveSearchParamParsers);
  const [selectedItem, setSelectedItem] = useState<StorageObject | null>(null);
  const [renameTarget, setRenameTarget] = useState<StorageObject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StorageObject | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const deferredQuery = useDeferredValue(searchState.q);
  const invalidateDriveQueries = useInvalidateDriveQueries(wsId);

  const normalizedSearchState = useMemo(
    () => ({ ...searchState, q: deferredQuery }),
    [deferredQuery, searchState]
  );
  const directoryQuery = useWorkspaceStorageDirectoryQuery(
    wsId,
    normalizedSearchState
  );
  const analyticsQuery = useWorkspaceStorageAnalyticsQuery(wsId);

  const items = directoryQuery.data?.items ?? [];
  const total = directoryQuery.data?.total ?? 0;
  const currentPath = searchState.path;
  const pathSegments = getPathSegments(currentPath);
  const selection = useDriveSelectionState({ currentPath, items });

  const updateSearchState = useCallback(
    (
      updates: Partial<{
        path: string | null;
        q: string | null;
        sortBy: DriveSortBy;
        sortOrder: 'asc' | 'desc';
        view: DriveViewMode;
      }>
    ) => {
      startTransition(() => {
        void setSearchState(updates);
      });
    },
    [setSearchState]
  );

  const handleNavigateToPath = useCallback(
    (nextPath: string) => updateSearchState({ path: nextPath || null }),
    [updateSearchState]
  );
  const handleNavigateIntoFolder = useCallback(
    (name: string) => {
      handleNavigateToPath(currentPath ? `${currentPath}/${name}` : name);
    },
    [currentPath, handleNavigateToPath]
  );
  const handleRefresh = useCallback(async () => {
    await invalidateDriveQueries();
  }, [invalidateDriveQueries]);
  const handleNavigateUp = useCallback(() => {
    if (currentPath) {
      handleNavigateToPath(pathSegments.slice(0, -1).join('/'));
    }
  }, [currentPath, handleNavigateToPath, pathSegments]);

  const deleteMutation = useDriveDeleteMutation({
    currentPath,
    wsId,
    onSuccess: async () => {
      await invalidateDriveQueries();
      selection.setSelectedKeys([]);
    },
    onSettled: () => {
      setDeleteTarget(null);
      setBulkDeleteDialogOpen(false);
    },
  });

  const currentDirectorySegment = pathSegments.at(-1);
  const directoryLabel = currentDirectorySegment
    ? getStoragePathSegmentDisplayName(currentDirectorySegment)
    : t('root_label');
  const largestFileName = analyticsQuery.data?.largestFile?.name
    ? getStoragePathSegmentDisplayName(analyticsQuery.data.largestFile.name)
    : t('not_available');
  const smallestFileName = analyticsQuery.data?.smallestFile?.name
    ? getStoragePathSegmentDisplayName(analyticsQuery.data.smallestFile.name)
    : t('not_available');
  const currentFolderCount = items.filter((item) => !item.id).length;

  return {
    analyticsQuery,
    bulkDeleteDialogOpen,
    currentFileCount: items.length - currentFolderCount,
    currentFolderCount,
    currentPath,
    deleteMutation,
    deleteTarget,
    directoryLabel,
    directoryQuery,
    handleNavigateIntoFolder,
    handleNavigateToPath,
    handleNavigateUp,
    handleRefresh,
    hasMoreResults: directoryQuery.hasNextPage ?? false,
    isSummaryExpanded,
    items,
    largestFileName,
    renameTarget,
    searchState,
    selectedItem,
    selection,
    setBulkDeleteDialogOpen,
    setDeleteTarget,
    setIsSummaryExpanded,
    setRenameTarget,
    setSelectedItem,
    showingCount: items.length,
    smallestFileName,
    total,
    updateSearchState,
  };
}
