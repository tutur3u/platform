'use client';

import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { ListWorkspaceTasksOptions } from '@tuturuuu/internal-api/tasks';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  getPersonalExternalStagingListId,
  type UnprioritizedPosition,
} from '@tuturuuu/utils/task-helper';
import { useCallback, useMemo } from 'react';
import type { TaskFilters } from '../boards/boardId/task-filter';
import type { ListStatusFilter } from '../shared/board-header';
import { getListStatusesForFilter } from './board-header/board-filter-state';
import {
  sortLocalTasks,
  taskMatchesLocalFilters,
} from './board-task-filtering';
import {
  listBoardTaskCountsForSearch,
  listBoardTasksForSearch,
} from './board-task-search';
import type { ViewType } from './board-views';
import { useProgressiveLoader } from './progressive-loader-context';

/**
 * The tasks a board view shows and the list counts behind its filters.
 * Filters, search and sort on the board's own tasks run in the browser over
 * one unfiltered copy (or the board cache once every list is loaded); only
 * another source scope is filtered on the server.
 */
export function useBoardTaskSource({
  autoCollapseEmptyTaskLists,
  board,
  currentUserId,
  currentView,
  effectiveWorkspaceId,
  filters,
  listStatusFilter,
  lists,
  localTaskState,
  personal,
  tasks,
  unprioritizedPosition,
}: {
  autoCollapseEmptyTaskLists: boolean;
  board: Pick<WorkspaceTaskBoard, 'id' | 'ticket_prefix'>;
  currentUserId?: string;
  currentView: ViewType;
  effectiveWorkspaceId: string;
  filters: TaskFilters;
  listStatusFilter: ListStatusFilter;
  lists: TaskList[];
  localTaskState: boolean;
  personal: boolean;
  tasks: Task[];
  unprioritizedPosition: UnprioritizedPosition;
}) {
  const queryClient = useQueryClient();
  const sourceScope = filters.sourceScope ?? 'all_visible';
  const sourceWorkspaceIds = filters.sourceWorkspaceIds ?? [];
  const sourceBoardIds = filters.sourceBoardIds ?? [];
  const isExternalSourceScope =
    sourceScope === 'external_current_workspace' ||
    sourceScope === 'external_specific';
  const listStatusesForQuery = useMemo(
    () => getListStatusesForFilter(listStatusFilter),
    [listStatusFilter]
  );
  const hasTaskFilters = useMemo(
    () =>
      filters.labels.length > 0 ||
      filters.assignees.length > 0 ||
      filters.projects.length > 0 ||
      filters.priorities.length > 0 ||
      !!filters.dueDateRange?.from ||
      !!filters.dueDateRange?.to ||
      typeof filters.estimationRange?.min === 'number' ||
      typeof filters.estimationRange?.max === 'number' ||
      !!filters.searchQuery?.trim() ||
      filters.includeMyTasks ||
      filters.includeUnassigned ||
      sourceScope !== 'all_visible' ||
      sourceWorkspaceIds.length > 0 ||
      sourceBoardIds.length > 0,
    [filters, sourceBoardIds.length, sourceScope, sourceWorkspaceIds.length]
  );
  const hasServerTaskQuery = hasTaskFilters || !!filters.sortBy;
  // Filters, search and sort on this board run in the browser over one
  // unfiltered copy of its tasks, so changing them sends no request. Only
  // another source scope (tasks from other boards) is filtered on the server.
  const filterOnServer = !localTaskState && sourceScope !== 'all_visible';
  const { pagination } = useProgressiveLoader();
  // Every list's pages, a personal board's external tasks included, are in
  // the board cache, so it holds every task.
  const boardLoaded = [
    ...lists.filter((list) => !list.deleted).map((list) => list.id),
    ...(personal ? [getPersonalExternalStagingListId(board.id)] : []),
  ].every((listId) => {
    const state = pagination[listId];
    return Boolean(
      state && !state.hasMore && !state.isInitialLoad && !state.isLoading
    );
  });
  const taskQueryOptions = useMemo<ListWorkspaceTasksOptions>(
    () => ({
      assignedToMe: filters.includeMyTasks || undefined,
      assigneeIds: filters.includeMyTasks
        ? undefined
        : filters.assignees.map((assignee) => assignee.id),
      dueDateFrom: filters.dueDateRange?.from?.toISOString(),
      dueDateTo: filters.dueDateRange?.to?.toISOString(),
      estimationMax: filters.estimationRange?.max,
      estimationMin: filters.estimationRange?.min,
      includeUnassigned: filters.includeUnassigned || undefined,
      labelIds: filters.labels.map((label) => label.id),
      priorities: filters.priorities,
      projectIds: filters.projects.map((project) => project.id),
      q: filters.searchQuery?.trim() || undefined,
      sortBy: filters.sortBy,
      unprioritizedPosition,
      sourceBoardIds,
      sourceScope,
      sourceWorkspaceIds,
    }),
    [
      filters.assignees,
      filters.dueDateRange?.from,
      filters.dueDateRange?.to,
      filters.estimationRange?.max,
      filters.estimationRange?.min,
      filters.includeMyTasks,
      filters.includeUnassigned,
      filters.labels,
      filters.priorities,
      filters.projects,
      filters.searchQuery,
      filters.sortBy,
      unprioritizedPosition,
      sourceBoardIds,
      sourceScope,
      sourceWorkspaceIds,
    ]
  );
  const taskFilterKey = useMemo(
    () =>
      JSON.stringify({
        listStatusFilter,
        query: taskQueryOptions,
        scope: sourceScope,
        sourceBoardIds: [...sourceBoardIds].sort(),
        sourceWorkspaceIds: [...sourceWorkspaceIds].sort(),
      }),
    [
      listStatusFilter,
      sourceBoardIds,
      sourceScope,
      sourceWorkspaceIds,
      taskQueryOptions,
    ]
  );
  // The unfiltered copy is keyed by list status only, so it is fetched once
  // and reused by every filter, search and sort after it.
  const boardCopyKey = useMemo(
    () => JSON.stringify({ boardCopy: true, listStatusFilter }),
    [listStatusFilter]
  );
  const fullTasksKey = filterOnServer ? taskFilterKey : boardCopyKey;
  const shouldEagerLoadTasks =
    currentView === 'list' ||
    currentView === 'timeline' ||
    (hasServerTaskQuery && (filterOnServer || !boardLoaded));
  const fetchBoardTasks = useCallback(
    () =>
      listBoardTasksForSearch(effectiveWorkspaceId, {
        ...(filterOnServer ? taskQueryOptions : {}),
        boardId: board.id,
        includeRelationshipSummary: false,
        listStatuses: listStatusesForQuery,
        limit: 200,
      }),
    [
      board.id,
      effectiveWorkspaceId,
      filterOnServer,
      listStatusesForQuery,
      taskQueryOptions,
    ]
  );

  const primeFullTaskCache = useCallback(
    (nextView: ViewType) => {
      if (localTaskState) return;
      if (nextView !== 'list' && nextView !== 'timeline') return;

      void queryClient.prefetchQuery({
        queryKey: ['tasks-full', board.id, fullTasksKey],
        queryFn: fetchBoardTasks,
        staleTime: 5 * 60_000,
      });
    },
    [board.id, fetchBoardTasks, fullTasksKey, localTaskState, queryClient]
  );

  // Fetch the unfiltered copy as soon as a filter looks likely, so the
  // first filter, search or sort usually finds it already loaded.
  const prefetchBoardCopy = useCallback(() => {
    if (localTaskState || filterOnServer || boardLoaded) return;
    void queryClient.prefetchQuery({
      queryKey: ['tasks-full', board.id, boardCopyKey],
      queryFn: fetchBoardTasks,
      staleTime: 5 * 60_000,
    });
  }, [
    board.id,
    boardCopyKey,
    boardLoaded,
    fetchBoardTasks,
    filterOnServer,
    localTaskState,
    queryClient,
  ]);

  const {
    data: fullTasks = [],
    isFetching: isFullTasksFetching,
    isPending: isFullTasksPending,
    isLoading: isFullTasksLoading,
    isSuccess: isFullTasksSuccess,
    isError: isFullTasksError,
  } = useQuery({
    queryKey: ['tasks-full', board.id, fullTasksKey],
    enabled: !localTaskState && shouldEagerLoadTasks,
    queryFn: fetchBoardTasks,
    // A server-filtered result stays on screen until the next one lands.
    placeholderData: filterOnServer ? keepPreviousData : undefined,
    refetchOnMount: false,
    staleTime: 5 * 60_000,
  });

  // The browser holds every task of the board: the board cache with all its
  // pages, or the unfiltered copy. Until then, list counts come from the server.
  const baseComplete =
    localTaskState ||
    boardLoaded ||
    (!filterOnServer && shouldEagerLoadTasks && isFullTasksSuccess);
  // While the unfiltered copy is on its way, its counts follow from it.
  const countsOnServer =
    !localTaskState &&
    (filterOnServer || (!baseComplete && !shouldEagerLoadTasks));
  const countsEnabled =
    countsOnServer &&
    Boolean(
      hasTaskFilters || filters.hideEmptyTaskLists || autoCollapseEmptyTaskLists
    );
  const {
    data: filteredListCounts,
    isFetching: isFilteredListCountsFetching,
    isPending: isFilteredListCountsPending,
  } = useQuery({
    queryKey: ['task-list-counts', board.id, taskFilterKey],
    enabled: countsEnabled,
    queryFn: () =>
      listBoardTaskCountsForSearch(effectiveWorkspaceId, {
        ...taskQueryOptions,
        boardId: board.id,
        includeListCounts: true,
        includeRelationshipSummary: false,
        limit: 0,
        listStatuses: listStatusesForQuery,
      }),
    staleTime: 30_000,
  });

  // The board cache is what the board shows; the unfiltered copy fills in
  // pages not loaded yet while a filter, search, sort or full view needs them.
  const localBaseTasks = useMemo(() => {
    if (localTaskState || filterOnServer || fullTasks.length === 0)
      return tasks;
    if (boardLoaded || !shouldEagerLoadTasks) return tasks;
    const merged = new Map(fullTasks.map((task) => [task.id, task] as const));
    for (const task of tasks) {
      const copy = merged.get(task.id);
      merged.set(task.id, copy ? ({ ...task, ...copy } as Task) : task);
    }
    return [...merged.values()];
  }, [
    boardLoaded,
    filterOnServer,
    fullTasks,
    localTaskState,
    shouldEagerLoadTasks,
    tasks,
  ]);
  const locallyFilteredTasks = useMemo(
    () =>
      sortLocalTasks(
        localBaseTasks.filter((task) =>
          taskMatchesLocalFilters(
            task,
            filters,
            currentUserId,
            board.ticket_prefix
          )
        ),
        filters.sortBy,
        unprioritizedPosition
      ),
    [
      board.ticket_prefix,
      currentUserId,
      filters,
      localBaseTasks,
      unprioritizedPosition,
    ]
  );

  const localListCounts = useMemo(() => {
    if (countsOnServer || !baseComplete) return null;
    if (
      !hasTaskFilters &&
      !filters.hideEmptyTaskLists &&
      !autoCollapseEmptyTaskLists
    )
      return null;

    const counts = new Map<string, number>();
    for (const task of locallyFilteredTasks) {
      counts.set(task.list_id, (counts.get(task.list_id) ?? 0) + 1);
    }

    return [...counts.entries()].map(([list_id, count]) => ({
      list_id,
      count,
    }));
  }, [
    autoCollapseEmptyTaskLists,
    baseComplete,
    countsOnServer,
    filters.hideEmptyTaskLists,
    hasTaskFilters,
    locallyFilteredTasks,
  ]);

  const sourceTasks = useMemo(() => {
    if (!filterOnServer) return locallyFilteredTasks;
    // Another source scope: the server's result, empty until it lands.
    return shouldEagerLoadTasks ? fullTasks : tasks;
  }, [
    filterOnServer,
    fullTasks,
    locallyFilteredTasks,
    shouldEagerLoadTasks,
    tasks,
  ]);

  return {
    // Board cache plus the copy: what a search can find, loaded or not.
    baseTasks: localBaseTasks,
    filterOnServer,
    hasTaskFilters,
    isExternalSourceScope,
    isFullTasksError,
    isFullTasksLoading,
    isSearching: isFullTasksFetching || isFilteredListCountsFetching,
    listCounts: countsOnServer ? filteredListCounts : localListCounts,
    // Filtering over the board's unfiltered copy needs no more pages.
    pagesCovered: !localTaskState && !filterOnServer && shouldEagerLoadTasks,
    prefetchBoardCopy,
    primeFullTaskCache,
    // The first tasks and counts the board waits for have landed.
    ready:
      (!shouldEagerLoadTasks || !isFullTasksPending) &&
      ((!hasTaskFilters &&
        !filters.hideEmptyTaskLists &&
        !autoCollapseEmptyTaskLists) ||
        !countsEnabled ||
        !isFilteredListCountsPending),
    sourceTasks,
  };
}
