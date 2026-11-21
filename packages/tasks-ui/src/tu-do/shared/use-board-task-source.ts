'use client';

import {
  infiniteQueryOptions,
  isCancelledError,
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  listWorkspaceTasks,
  type ListWorkspaceTasksOptions,
  type WorkspaceTasksResponse,
} from '@tuturuuu/internal-api/tasks';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  getPersonalExternalStagingListId,
  parseTaskIdentifierQuery,
  type UnprioritizedPosition,
} from '@tuturuuu/utils/task-helper';
import type { BoardTaskPage } from '@tuturuuu/utils/task-helper/board-task-query-cache';
import { useMemo } from 'react';
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
 * Local filters sort and match the loaded board pages. The server resolves
 * retained ticket keys and matches tasks in other source scopes.
 */
/** Empty continuation pages one Load more may step over. */
const MAX_EMPTY_PAGE_HOPS = 3;

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
  const ticketSearch = filters.searchQuery
    ? parseTaskIdentifierQuery(filters.searchQuery)?.ticketPrefix
    : null;
  const filterOnServer =
    !localTaskState && (isExternalSourceScope || Boolean(ticketSearch));
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
  const pageScope =
    sourceScope === 'current_board' ? 'current_board' : 'all_visible';
  const shouldEagerLoadTasks =
    currentView === 'list' ||
    currentView === 'timeline' ||
    currentView === 'fleet' ||
    (currentView === 'kanban' &&
      hasServerTaskQuery &&
      (filterOnServer || !boardLoaded));
  const pageOptions = infiniteQueryOptions({
    queryKey: [
      'tasks-full',
      board.id,
      'pages',
      effectiveWorkspaceId,
      boardCopyKey,
      pageScope,
    ],
    initialPageParam: 'start',
    queryFn: async ({ pageParam, signal }): Promise<BoardTaskPage> => {
      // Personal continuations can filter a whole page away (tasks already
      // placed, or in a workspace the actor left). Step over a bounded number
      // of empty pages so Load more always shows a change when one exists.
      let cursor: string | null = pageParam;
      for (let hop = 0; cursor && hop <= MAX_EMPTY_PAGE_HOPS; hop++) {
        const { tasks, nextCursor }: WorkspaceTasksResponse =
          await listWorkspaceTasks(effectiveWorkspaceId, {
            sourceScope: pageScope,
            boardId: board.id,
            cursor,
            includeRelationshipSummary: false,
            listStatuses: listStatusesForQuery,
            signal,
          });
        if (nextCursor === undefined)
          throw new Error('Missing board task continuation');
        if (tasks.length > 0 || !nextCursor) return { tasks, nextCursor };
        cursor = nextCursor;
      }
      return { tasks: [], nextCursor: cursor };
    },
    getNextPageParam: (page) => page.nextCursor,
    refetchOnMount: false,
    staleTime: 5 * 60_000,
  });
  const useBoardPages =
    !localTaskState && !filterOnServer && !boardLoaded && shouldEagerLoadTasks;
  const pages = useInfiniteQuery({ ...pageOptions, enabled: useBoardPages });
  const serverTasks = useQuery({
    queryKey: [
      'tasks-full',
      board.id,
      'source-filter',
      effectiveWorkspaceId,
      taskFilterKey,
    ],
    enabled: shouldEagerLoadTasks && filterOnServer,
    queryFn: () =>
      listBoardTasksForSearch(effectiveWorkspaceId, {
        ...taskQueryOptions,
        boardId: board.id,
        includeRelationshipSummary: false,
        listStatuses: listStatusesForQuery,
        limit: 200,
      }),
    // A server-filtered result stays on screen until the next one lands.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const fullTasks = useMemo(() => {
    if (filterOnServer) return serverTasks.data ?? [];
    if (!useBoardPages || !pages.data) return [];
    return [
      ...new Map(
        pages.data.pages.flatMap((page) =>
          page.tasks.map((task) => [task.id, task] as const)
        )
      ).values(),
    ];
  }, [filterOnServer, pages.data, serverTasks.data, useBoardPages]);
  const baseComplete =
    localTaskState ||
    boardLoaded ||
    (!filterOnServer &&
      useBoardPages &&
      Boolean(pages.data) &&
      !pages.hasNextPage);
  const activeQuery = filterOnServer ? serverTasks : pages;
  const activeQueryEnabled =
    !localTaskState &&
    (useBoardPages || (shouldEagerLoadTasks && filterOnServer));
  const hasMore = useBoardPages && pages.hasNextPage;
  const loadingMore = useBoardPages && pages.isFetchingNextPage;
  // Optimistic edits cancel in-flight task reads; that is not a failure.
  const pageFailed =
    activeQueryEnabled &&
    activeQuery.isError &&
    !isCancelledError(activeQuery.error);
  // Exact cross-scope counts keep columns visible while their rows are paged.
  // Local search also matches client-side metadata, so partial counts cannot
  // establish that a list has zero matches.
  const countsOnServer =
    !localTaskState && (filterOnServer || (!baseComplete && !useBoardPages));
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
    queryKey: [
      'task-list-counts',
      board.id,
      effectiveWorkspaceId,
      taskFilterKey,
    ],
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
    if (boardLoaded || !useBoardPages) return tasks;
    const merged = new Map(fullTasks.map((task) => [task.id, task] as const));
    for (const task of tasks) {
      const copy = merged.get(task.id);
      merged.set(task.id, copy ? ({ ...copy, ...task } as Task) : task);
    }
    return [...merged.values()];
  }, [
    boardLoaded,
    filterOnServer,
    fullTasks,
    localTaskState,
    useBoardPages,
    tasks,
  ]);
  const locallyFilteredTasks = useMemo(
    () =>
      sortLocalTasks(
        localBaseTasks.filter(
          (task) =>
            (sourceScope !== 'current_board' || !task.is_personal_external) &&
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
      sourceScope,
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
    return shouldEagerLoadTasks ? fullTasks : tasks;
  }, [
    filterOnServer,
    fullTasks,
    locallyFilteredTasks,
    shouldEagerLoadTasks,
    tasks,
  ]);

  return {
    baseTasks: localBaseTasks,
    filterOnServer,
    hasTaskFilters,
    isExternalSourceScope,
    isFullTasksError:
      activeQueryEnabled && activeQuery.isError && !activeQuery.data,
    isFullTasksLoading: activeQueryEnabled && activeQuery.isLoading,
    isSearching:
      (activeQueryEnabled && activeQuery.isFetching) ||
      isFilteredListCountsFetching,
    listCounts: countsOnServer ? filteredListCounts : localListCounts,
    pagesCovered: useBoardPages || filterOnServer,
    // Use the first page for filter intent without loading a board in the
    // background while the user is on a separate surface.
    prefetchBoardCopy: () => {
      if (!localTaskState && !filterOnServer && !boardLoaded)
        void queryClient.prefetchInfiniteQuery(pageOptions);
    },
    pagination:
      activeQueryEnabled && (hasMore || loadingMore || pageFailed)
        ? {
            hasMore,
            pending: loadingMore,
            failed: pageFailed,
            loadMore: () => {
              if (loadingMore || activeQuery.isFetching) return;
              if (hasMore) void pages.fetchNextPage({ cancelRefetch: false });
              else if (pageFailed)
                void activeQuery.refetch({ cancelRefetch: false });
            },
          }
        : null,
    ready:
      (!activeQueryEnabled || !activeQuery.isPending) &&
      (!countsEnabled || !isFilteredListCountsPending),
    sourceTasks,
  };
}
