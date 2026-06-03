'use client';

import {
  formatHotkeySequence,
  useHotkey,
  useHotkeySequence,
} from '@tanstack/react-hotkeys';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ListWorkspaceTasksOptions,
  listWorkspaceTasks,
} from '@tuturuuu/internal-api/tasks';
import type {
  Workspace,
  WorkspaceProductTier,
  WorkspaceTaskBoard,
} from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  getPersonalExternalStagingListId,
  type WorkspaceLabel,
} from '@tuturuuu/utils/task-helper';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { KanbanBoard } from '../boards/boardId/kanban';
import type { TaskFilters } from '../boards/boardId/task-filter';
import { TimelineBoard } from '../boards/boardId/timeline-board';
import { useTaskDialog } from '../hooks/useTaskDialog';
import { BoardHeader, type ListStatusFilter } from '../shared/board-header';
import { ListView } from '../shared/list-view';
import { RecycleBinPanel } from '../shared/recycle-bin-panel';
import { loadBoardConfig } from './board-config-storage';

export type ViewType = 'kanban' | 'list' | 'timeline';

const HOTKEY_CREATE_TASK = 'C';
const HOTKEY_GO_TO_KANBAN: ['G', 'K'] = ['G', 'K'];
const HOTKEY_GO_TO_LIST: ['G', 'L'] = ['G', 'L'];
const HOTKEY_GO_TO_TIMELINE: ['G', 'T'] = ['G', 'T'];
const EXTERNAL_TASKS_COLLAPSED_STORAGE_PREFIX =
  'personal-board-external-tasks-collapsed';
const DEFAULT_TASK_FILTERS: TaskFilters = {
  labels: [],
  assignees: [],
  projects: [],
  priorities: [],
  dueDateRange: null,
  estimationRange: null,
  includeMyTasks: false,
  includeUnassigned: false,
  sourceScope: 'all_visible',
  sourceWorkspaceIds: [],
  sourceBoardIds: [],
};

function hasAssignedExternalTasks(tasks: Task[], boardId: string) {
  const externalStagingListId = getPersonalExternalStagingListId(boardId);

  return tasks.some(
    (task) =>
      task.is_personal_external === true ||
      task.list_id === externalStagingListId ||
      Boolean(task.source_workspace_id)
  );
}

interface Props {
  workspace: Workspace;
  workspaceTier?: WorkspaceProductTier | null;
  board: WorkspaceTaskBoard;
  tasks: Task[];
  lists: TaskList[];
  workspaceLabels: WorkspaceLabel[];
  canManageBoard?: boolean;
  currentUserId?: string;
}

export function BoardViews({
  workspace,
  workspaceTier,
  board,
  tasks,
  lists,
  canManageBoard = true,
  currentUserId,
}: Props) {
  const t = useTranslations('common');
  const tTasks = useTranslations('ws-tasks');
  const tBoards = useTranslations('ws-task-boards');
  const queryClient = useQueryClient();
  const effectiveWorkspaceId = board.ws_id ?? workspace.id;
  const [currentView, setCurrentView] = useState<ViewType>('kanban');
  const [externalTasksCollapsed, setExternalTasksCollapsed] = useState(false);
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_TASK_FILTERS);
  const [listStatusFilter, setListStatusFilter] =
    useState<ListStatusFilter>('all');
  // Local per-session optimistic overrides (e.g., timeline resize) so switching views preserves changes
  const [taskOverrides, setTaskOverrides] = useState<
    Record<string, Partial<Task>>
  >({});
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const { createTask } = useTaskDialog();
  const sourceScope = filters.sourceScope ?? 'all_visible';
  const sourceWorkspaceIds = filters.sourceWorkspaceIds ?? [];
  const sourceBoardIds = filters.sourceBoardIds ?? [];
  const isExternalSourceScope =
    sourceScope === 'external_current_workspace' ||
    sourceScope === 'external_specific';
  const listStatusesForQuery = useMemo(
    () => (listStatusFilter === 'all' ? undefined : [listStatusFilter]),
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
  const viewHotkeyLabels = useMemo(
    () => ({
      kanban: formatHotkeySequence(HOTKEY_GO_TO_KANBAN),
      list: formatHotkeySequence(HOTKEY_GO_TO_LIST),
      timeline: formatHotkeySequence(HOTKEY_GO_TO_TIMELINE),
    }),
    []
  );
  const shouldEagerLoadTasks =
    currentView === 'list' || currentView === 'timeline' || hasServerTaskQuery;
  const fetchBoardTasks = useCallback(async () => {
    const result = await listWorkspaceTasks(effectiveWorkspaceId, {
      ...taskQueryOptions,
      boardId: board.id,
      listStatuses: listStatusesForQuery,
      limit: 200,
    });
    return result.tasks;
  }, [board.id, effectiveWorkspaceId, listStatusesForQuery, taskQueryOptions]);

  const primeFullTaskCache = useCallback(
    (nextView: ViewType) => {
      if (nextView !== 'list' && nextView !== 'timeline') return;

      void queryClient.prefetchQuery({
        queryKey: ['tasks-full', board.id, taskFilterKey],
        queryFn: fetchBoardTasks,
        staleTime: 0,
      });
    },
    [board.id, fetchBoardTasks, queryClient, taskFilterKey]
  );

  const handleViewChange = useCallback(
    (nextView: ViewType) => {
      setCurrentView(nextView);
      primeFullTaskCache(nextView);
    },
    [primeFullTaskCache]
  );

  const { data: fullTasks = [], isFetching: isFullTasksFetching } = useQuery({
    queryKey: ['tasks-full', board.id, taskFilterKey],
    enabled: shouldEagerLoadTasks,
    queryFn: fetchBoardTasks,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const initialTaskLists = useMemo(
    () => lists.filter((list) => !list.deleted),
    [lists]
  );

  const { data: boardLists = initialTaskLists } = useQuery({
    queryKey: ['task_lists', board.id],
    queryFn: async () => initialTaskLists,
    initialData: initialTaskLists,
    staleTime: Infinity,
  });

  useEffect(() => {
    queryClient.setQueryData(['task_lists', board.id], initialTaskLists);
  }, [board.id, initialTaskLists, queryClient]);

  useLayoutEffect(() => {
    const savedConfig = loadBoardConfig(board.id);

    if (!savedConfig) {
      setCurrentView('kanban');
      setFilters(DEFAULT_TASK_FILTERS);
      setListStatusFilter('all');
      return;
    }

    setCurrentView(savedConfig.currentView);
    setFilters({
      ...DEFAULT_TASK_FILTERS,
      ...savedConfig.filters,
    });
    setListStatusFilter(savedConfig.listStatusFilter);
  }, [board.id]);

  useEffect(() => {
    if (!workspace.personal || typeof window === 'undefined') {
      setExternalTasksCollapsed(false);
      return;
    }

    const storedValue = window.localStorage.getItem(
      `${EXTERNAL_TASKS_COLLAPSED_STORAGE_PREFIX}:${board.id}`
    );
    const storedPreference =
      storedValue === null ? null : storedValue === 'true';

    setExternalTasksCollapsed(
      storedPreference ?? !hasAssignedExternalTasks(tasks, board.id)
    );
  }, [board.id, tasks, workspace.personal]);

  const handleExternalTasksCollapsedChange = useCallback(
    (collapsed: boolean) => {
      setExternalTasksCollapsed(collapsed);

      if (!workspace.personal || typeof window === 'undefined') return;

      window.localStorage.setItem(
        `${EXTERNAL_TASKS_COLLAPSED_STORAGE_PREFIX}:${board.id}`,
        String(collapsed)
      );
    },
    [board.id, workspace.personal]
  );

  const externalStagingList = useMemo<TaskList | null>(() => {
    if (!workspace.personal) return null;

    return {
      id: getPersonalExternalStagingListId(board.id),
      name: tTasks('external_tasks'),
      archived: false,
      deleted: false,
      created_at: board.created_at ?? '',
      board_id: board.id,
      creator_id: '',
      status: 'not_started',
      color: 'CYAN',
      position: Number.MIN_SAFE_INTEGER,
      is_external_staging: true,
      is_external_collapsed: externalTasksCollapsed,
    };
  }, [
    board.created_at,
    board.id,
    externalTasksCollapsed,
    tTasks,
    workspace.personal,
  ]);

  const activeLists = useMemo(() => {
    const realLists = boardLists.filter((list) => !list.deleted);
    return externalStagingList
      ? [externalStagingList, ...realLists]
      : realLists;
  }, [boardLists, externalStagingList]);

  const { data: filteredListCounts, isFetching: isFilteredListCountsFetching } =
    useQuery({
      queryKey: ['task-list-counts', board.id, taskFilterKey],
      enabled: hasTaskFilters,
      queryFn: async () => {
        const result = await listWorkspaceTasks(effectiveWorkspaceId, {
          ...taskQueryOptions,
          boardId: board.id,
          includeListCounts: true,
          includeRelationshipSummary: false,
          limit: 0,
          listStatuses: listStatusesForQuery,
        });
        return result.listCounts ?? [];
      },
      staleTime: 30_000,
    });

  // Filter lists based on selected status filter
  const statusFilteredLists = useMemo(() => {
    if (listStatusFilter === 'all') return activeLists;

    const stagingLists = activeLists.filter((list) => list.is_external_staging);
    const realLists = activeLists.filter(
      (list) => !list.is_external_staging && list.status === listStatusFilter
    );
    return [...stagingLists, ...realLists];
  }, [activeLists, listStatusFilter]);

  const filteredLists = useMemo(() => {
    if (!hasTaskFilters || !filteredListCounts) return statusFilteredLists;

    const countByListId = new Map(
      filteredListCounts.map((entry) => [entry.list_id, entry.count] as const)
    );

    return statusFilteredLists.filter(
      (list) => (countByListId.get(list.id) ?? 0) > 0
    );
  }, [filteredListCounts, hasTaskFilters, statusFilteredLists]);

  const sourceTasks = useMemo(() => {
    if (!shouldEagerLoadTasks) return tasks;

    if (fullTasks.length === 0) {
      return hasServerTaskQuery || sourceScope !== 'all_visible' ? [] : tasks;
    }

    if (hasServerTaskQuery || sourceScope !== 'all_visible') {
      return fullTasks;
    }

    const progressiveById = new Map(
      tasks.map((task) => [task.id, task] as const)
    );
    const merged = fullTasks.map(
      (task) => ({ ...(progressiveById.get(task.id) ?? {}), ...task }) as Task
    );

    for (const task of tasks) {
      if (!merged.some((item) => item.id === task.id)) {
        merged.push(task);
      }
    }

    return merged;
  }, [fullTasks, hasServerTaskQuery, shouldEagerLoadTasks, sourceScope, tasks]);

  // Keep only tasks that belong to the server-visible lists/status scope.
  const filteredTasks = useMemo(() => {
    const listIds = new Set(filteredLists.map((list) => list.id));
    return isExternalSourceScope
      ? sourceTasks
      : sourceTasks.filter((task) => listIds.has(task.list_id));
  }, [filteredLists, isExternalSourceScope, sourceTasks]);

  // Apply optimistic overrides so views receive up-to-date edits (durations, name, dates) even before refetch.
  const effectiveTasks = useMemo(() => {
    let tasks = filteredTasks;

    // Apply overrides
    if (Object.keys(taskOverrides).length) {
      tasks = tasks.map((t) => {
        const o = taskOverrides[t.id];
        return o ? ({ ...t, ...o } as Task) : t;
      });
    }

    tasks = tasks.filter((task) => !task.deleted_at);

    return tasks;
  }, [filteredTasks, taskOverrides]);

  const handleTaskPartialUpdate = (taskId: string, partial: Partial<Task>) => {
    setTaskOverrides((prev) => ({
      ...prev,
      [taskId]: { ...(prev[taskId] || {}), ...partial },
    }));
  };

  const handleUpdate = async () => {
    // Note: We intentionally do NOT invalidate queries here.
    // Optimistic updates handle immediate UI feedback, and realtime
    // subscription handles cross-user sync. Invalidating would cause
    // all tasks to flicker (disappear then reappear).
  };

  useHotkey(
    HOTKEY_CREATE_TASK,
    () => {
      const firstList = filteredLists.find((list) => !list.is_external_staging);
      if (!firstList) return;
      createTask(
        board.id,
        firstList.id,
        filteredLists.filter((list) => !list.is_external_staging),
        filters
      );
    },
    {
      enabled: filteredLists.some((list) => !list.is_external_staging),
      ignoreInputs: true,
      preventDefault: true,
    }
  );

  useHotkeySequence(
    HOTKEY_GO_TO_KANBAN,
    () => {
      handleViewChange('kanban');
    },
    {
      ignoreInputs: true,
      preventDefault: true,
    }
  );

  useHotkeySequence(
    HOTKEY_GO_TO_LIST,
    () => {
      handleViewChange('list');
    },
    {
      ignoreInputs: true,
      preventDefault: true,
    }
  );

  useHotkeySequence(
    HOTKEY_GO_TO_TIMELINE,
    () => {
      handleViewChange('timeline');
    },
    {
      ignoreInputs: true,
      preventDefault: true,
    }
  );

  const renderView = () => {
    switch (currentView) {
      case 'kanban':
        return (
          <KanbanBoard
            workspace={workspace}
            workspaceTier={workspaceTier}
            workspaceId={effectiveWorkspaceId}
            boardId={board.id}
            tasks={effectiveTasks}
            lists={filteredLists}
            isLoading={false}
            disableSort={!!filters.sortBy}
            listStatusFilter={listStatusFilter}
            filters={filters}
            isMultiSelectMode={isMultiSelectMode}
            setIsMultiSelectMode={setIsMultiSelectMode}
            onExternalTasksCollapsedChange={handleExternalTasksCollapsedChange}
          />
        );
      case 'list':
        return (
          <ListView
            workspaceId={effectiveWorkspaceId}
            boardId={board.id}
            tasks={effectiveTasks}
            lists={filteredLists}
            isPersonalWorkspace={workspace.personal}
            preserveTaskOrder={!!filters.sortBy}
            searchQuery={filters.searchQuery}
          />
        );
      case 'timeline':
        return (
          <TimelineBoard
            wsId={effectiveWorkspaceId}
            boardId={board.id}
            tasks={effectiveTasks}
            lists={filteredLists}
            onTaskPartialUpdate={handleTaskPartialUpdate}
          />
        );
      default:
        return (
          <KanbanBoard
            workspace={workspace}
            workspaceTier={workspaceTier}
            workspaceId={effectiveWorkspaceId}
            boardId={board.id}
            tasks={effectiveTasks}
            lists={filteredLists}
            isLoading={false}
            disableSort={!!filters.sortBy}
            listStatusFilter={listStatusFilter}
            filters={filters}
            isMultiSelectMode={isMultiSelectMode}
            setIsMultiSelectMode={setIsMultiSelectMode}
            onExternalTasksCollapsedChange={handleExternalTasksCollapsedChange}
          />
        );
    }
  };

  return (
    <div className="-m-2 -mb-4 flex h-[calc(100vh-0.5rem)] flex-1 flex-col md:-mx-4">
      <BoardHeader
        workspaceId={effectiveWorkspaceId}
        board={board}
        currentUserId={currentUserId}
        currentView={currentView}
        onViewChange={handleViewChange}
        viewHotkeyLabels={viewHotkeyLabels}
        filters={filters}
        onFiltersChange={setFilters}
        listStatusFilter={listStatusFilter}
        onListStatusFilterChange={setListStatusFilter}
        isPersonalWorkspace={workspace.personal}
        isSearching={isFullTasksFetching || isFilteredListCountsFetching}
        lists={boardLists}
        onUpdate={handleUpdate}
        onRecycleBinOpen={() => setRecycleBinOpen(true)}
        isMultiSelectMode={isMultiSelectMode}
        setIsMultiSelectMode={setIsMultiSelectMode}
        hideActions={!canManageBoard}
      />
      <div className="h-full overflow-hidden">{renderView()}</div>

      <RecycleBinPanel
        open={recycleBinOpen}
        onOpenChange={setRecycleBinOpen}
        wsId={effectiveWorkspaceId}
        boardId={board.id}
        lists={boardLists}
        translations={{
          recycleBin: t('recycle_bin'),
          recycleBinDescription: t('recycle_bin_description'),
          noDeletedTasks: t('no_deleted_tasks'),
          deletedTasksWillAppearHere: t('deleted_tasks_will_appear_here'),
          selectedOfTotal: t('selected_of_total', {
            selected: '{selected}',
            total: '{total}',
          }),
          deletedTasksCount: t('deleted_tasks_count', { count: '{count}' }),
          restore: t('restore'),
          delete: t('delete'),
          restoreTasksTitle: t('restore_tasks_title', { count: '{count}' }),
          restoreTasksDescription: t('restore_tasks_description'),
          cancel: t('cancel'),
          restoring: t('restoring'),
          permanentlyDeleteTitle: t('permanently_delete_title', {
            count: '{count}',
          }),
          permanentlyDeleteDescription: t('permanently_delete_description'),
          deleting: t('deleting'),
          deletePermanently: t('delete_permanently'),
          noListsAvailable: t('no_lists_available'),
          restoredTasks: t('restored_tasks', { count: '{count}' }),
          failedToRestore: t('failed_to_restore'),
          permanentlyDeleted: t('permanently_deleted', { count: '{count}' }),
          failedToDelete: t('failed_to_delete'),
          deletedAgo: t('deleted_ago', { time: '{time}' }),
          fromList: t('from_list', { list: '{list}' }),
          nProjects: t('n_projects', { count: '{count}' }),
          selectAllTasks: t('select_all_tasks'),
          selectTask: t('select_task', { name: '{name}' }),
          critical: tBoards('dialog.priority.critical'),
          high: tBoards('dialog.priority.high'),
          normal: tBoards('dialog.priority.normal'),
          low: tBoards('dialog.priority.low'),
          unknownList: t('unknown_list'),
        }}
      />
    </div>
  );
}
