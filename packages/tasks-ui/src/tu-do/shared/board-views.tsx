'use client';

import {
  formatHotkeySequence,
  useHotkey,
  useHotkeySequence,
} from '@tanstack/react-hotkeys';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListWorkspaceTasksOptions } from '@tuturuuu/internal-api/tasks';
import {
  TASK_BOARD_PINNED_SPECIAL_LISTS_CONFIG_ID,
  TASK_LAST_BOARD_VIEW_CONFIG_ID,
  TASK_QUICK_CREATE_TARGET_LIST_CONFIG_ID,
} from '@tuturuuu/internal-api/users';
import type {
  Workspace,
  WorkspaceProductTier,
  WorkspaceTaskBoard,
} from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useUserConfig } from '@tuturuuu/ui/hooks/use-user-config';
import {
  useUpdateUserWorkspaceConfig,
  useUserWorkspaceConfig,
} from '@tuturuuu/ui/hooks/use-user-workspace-config';
import {
  getPersonalExternalStagingListId,
  normalizeUnprioritizedPosition,
  TASK_UNPRIORITIZED_POSITION_CONFIG_ID,
  type WorkspaceLabel,
} from '@tuturuuu/utils/task-helper';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { KanbanBoard } from '../boards/boardId/kanban';
import type { TaskFilters } from '../boards/boardId/task-filter';
import { TimelineBoard } from '../boards/boardId/timeline-board';
import { DraftsPage } from '../drafts/drafts-page';
import { useTaskDialog } from '../hooks/useTaskDialog';
import MyTasksContent from '../my-tasks/my-tasks-content';
import { BoardHeader, type ListStatusFilter } from '../shared/board-header';
import { ListView } from '../shared/list-view';
import { RecycleBinContent } from '../shared/recycle-bin-panel';
import { loadBoardConfig } from './board-config-storage';
import {
  DEFAULT_BOARD_FILTERS,
  getListStatusesForFilter,
  listMatchesStatusFilter,
  sanitizeListStatusFilter,
  sanitizeSavedBoardFilters,
} from './board-header/board-filter-state';
import { useBoardHeaderData } from './board-header/use-board-header-data';
import { BoardSprintPill } from './board-sprints/board-sprint-pill';
import { useBoardSprints } from './board-sprints/use-board-sprints';
import {
  sortLocalTasks,
  taskMatchesLocalFilters,
} from './board-task-filtering';
import {
  listBoardTaskCountsForSearch,
  listBoardTasksForSearch,
} from './board-task-search';
import { BoardPanelFrame, KanbanPresentation } from './kanban-presentation';
import {
  parseSpecialTaskListPins,
  type SpecialTaskListPin,
  serializeSpecialTaskListPins,
} from './special-task-list-pins';
import {
  DEFAULT_TASK_QUICK_CREATE_TARGET_LIST,
  normalizeTaskQuickCreateTargetList,
} from './task-quick-create-target-list';
import { useAutoCollapseEmptyTaskLists } from './use-auto-collapse-empty-task-lists';
import { useKanbanLayoutState } from './use-kanban-layout-state';
import { useRecycleBinTranslations } from './use-recycle-bin-translations';
import { useTaskBoardListPreferences } from './use-task-board-list-preferences';

export type ViewType =
  | 'kanban'
  | 'list'
  | 'my_tasks'
  | 'timeline'
  | 'drafts'
  | 'recycle_bin';
const HOTKEY_CREATE_TASK = 'C';
const HOTKEY_GO_TO_KANBAN: ['G', 'K'] = ['G', 'K'];
const HOTKEY_GO_TO_LIST: ['G', 'L'] = ['G', 'L'];
const HOTKEY_GO_TO_MY_TASKS: ['G', 'M'] = ['G', 'M'];
const HOTKEY_GO_TO_TIMELINE: ['G', 'T'] = ['G', 'T'];
const HOTKEY_GO_TO_DRAFTS: ['G', 'D'] = ['G', 'D'];
const HOTKEY_GO_TO_RECYCLE_BIN: ['G', 'R'] = ['G', 'R'];
const DEFAULT_TASK_FILTERS: TaskFilters = DEFAULT_BOARD_FILTERS;
interface Props {
  workspace: Pick<Workspace, 'id' | 'personal'>;
  workspaceTier?: WorkspaceProductTier | null;
  board: WorkspaceTaskBoard & {
    access_type?: 'member' | 'guest';
    guest_permission?: 'view' | 'edit' | null;
    has_guest_access?: boolean;
  };
  tasks: Task[];
  lists: TaskList[];
  workspaceLabels: WorkspaceLabel[];
  availableViews?: ViewType[];
  canManageBoard?: boolean;
  currentUserId?: string;
  defaultView?: ViewType;
  idleBottomIsland?: ReactNode;
  publicHeaderPrefix?: ReactNode;
  publicView?: boolean;
  readOnly?: boolean;
}

export function BoardViews({
  workspace,
  workspaceTier,
  board,
  tasks,
  lists,
  availableViews,
  canManageBoard = true,
  currentUserId,
  defaultView,
  idleBottomIsland,
  publicHeaderPrefix,
  publicView = false,
  readOnly = false,
}: Props) {
  const tTasks = useTranslations('ws-tasks');
  const queryClient = useQueryClient();
  const effectiveWorkspaceId = board.ws_id ?? workspace.id;
  const [currentView, setCurrentView] = useState<ViewType>('kanban');
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_TASK_FILTERS);
  const [listStatusFilter, setListStatusFilter] =
    useState<ListStatusFilter>('all');
  const [taskOverrides, setTaskOverrides] = useState<
    Record<string, Partial<Task>>
  >({});
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [kanbanBulkSelectionActive, setKanbanBulkSelectionActive] =
    useState(false);
  const [hoveredTaskListId, setHoveredTaskListId] = useState<string | null>(
    null
  );
  const previousHideEmptyPreferenceRef = useRef<boolean | null>(null);
  const manualCollapseChangeRef = useRef<
    (listId: string, collapsed: boolean) => void
  >(() => undefined);
  const { createTask } = useTaskDialog();
  const localTaskState = readOnly || publicView;
  const { data: priorityPositionRaw } = useUserConfig(
    TASK_UNPRIORITIZED_POSITION_CONFIG_ID,
    'first',
    { enabled: !localTaskState }
  );
  const unprioritizedPosition =
    normalizeUnprioritizedPosition(priorityPositionRaw);
  const { data: quickCreateTargetListRaw } = useUserConfig(
    TASK_QUICK_CREATE_TARGET_LIST_CONFIG_ID,
    DEFAULT_TASK_QUICK_CREATE_TARGET_LIST,
    { enabled: !localTaskState }
  );
  const quickCreateTargetList = normalizeTaskQuickCreateTargetList(
    quickCreateTargetListRaw
  );
  const {
    persistCollapsedTaskLists,
    hideEmptyTaskListsByDefault,
    autoCollapseEmptyTaskLists,
    taskBoardListPreferencesReady,
  } = useTaskBoardListPreferences(localTaskState);
  const boardAssigneesEnabled =
    !workspace.personal ||
    board.access_type === 'guest' ||
    board.has_guest_access === true;
  const assigneeMemberSource: 'workspace' | 'board' | 'workspace-and-board' =
    board.access_type === 'guest'
      ? 'board'
      : board.has_guest_access === true
        ? workspace.personal
          ? 'board'
          : 'workspace-and-board'
        : 'workspace';
  const { data: pinnedSpecialListsRaw, isPending: pinnedSpecialListsPending } =
    useUserWorkspaceConfig(
      effectiveWorkspaceId,
      TASK_BOARD_PINNED_SPECIAL_LISTS_CONFIG_ID,
      null,
      { enabled: !localTaskState }
    );
  const updateUserWorkspaceConfig = useUpdateUserWorkspaceConfig();
  const specialTaskListPins = useMemo(
    () => parseSpecialTaskListPins(pinnedSpecialListsRaw),
    [pinnedSpecialListsRaw]
  );
  const handleSpecialTaskListPinnedChange = useCallback(
    (pin: SpecialTaskListPin, pinned: boolean) => {
      const nextPins = {
        ...specialTaskListPins,
        [pin]: pinned,
      };

      if (!pinned) delete nextPins[pin];

      updateUserWorkspaceConfig.mutate({
        configId: TASK_BOARD_PINNED_SPECIAL_LISTS_CONFIG_ID,
        value: serializeSpecialTaskListPins(nextPins),
        workspaceId: effectiveWorkspaceId,
      });
    },
    [effectiveWorkspaceId, specialTaskListPins, updateUserWorkspaceConfig]
  );
  const enabledViews = useMemo(
    () =>
      availableViews ??
      (publicView || readOnly
        ? (['kanban', 'list', 'timeline'] as ViewType[])
        : ([
            'kanban',
            'list',
            'my_tasks',
            'timeline',
            'drafts',
            'recycle_bin',
          ] as ViewType[])),
    [availableViews, publicView, readOnly]
  );
  const viewIsEnabled = useCallback(
    (view: ViewType) => !enabledViews || enabledViews.includes(view),
    [enabledViews]
  );
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
  const viewHotkeyLabels = useMemo(
    () => ({
      kanban: formatHotkeySequence(HOTKEY_GO_TO_KANBAN),
      list: formatHotkeySequence(HOTKEY_GO_TO_LIST),
      my_tasks: formatHotkeySequence(HOTKEY_GO_TO_MY_TASKS),
      timeline: formatHotkeySequence(HOTKEY_GO_TO_TIMELINE),
      drafts: formatHotkeySequence(HOTKEY_GO_TO_DRAFTS),
      recycle_bin: formatHotkeySequence(HOTKEY_GO_TO_RECYCLE_BIN),
    }),
    []
  );
  const shouldEagerLoadTasks =
    currentView === 'list' || currentView === 'timeline' || hasServerTaskQuery;
  const fetchBoardTasks = useCallback(
    () =>
      listBoardTasksForSearch(effectiveWorkspaceId, {
        ...taskQueryOptions,
        boardId: board.id,
        includeRelationshipSummary: false,
        listStatuses: listStatusesForQuery,
        limit: 200,
      }),
    [board.id, effectiveWorkspaceId, listStatusesForQuery, taskQueryOptions]
  );

  const primeFullTaskCache = useCallback(
    (nextView: ViewType) => {
      if (localTaskState) return;
      if (nextView !== 'list' && nextView !== 'timeline') return;

      void queryClient.prefetchQuery({
        queryKey: ['tasks-full', board.id, taskFilterKey],
        queryFn: fetchBoardTasks,
        staleTime: 5 * 60_000,
      });
    },
    [board.id, fetchBoardTasks, localTaskState, queryClient, taskFilterKey]
  );

  const handleViewChange = useCallback(
    (nextView: ViewType) => {
      if (!viewIsEnabled(nextView)) return;
      setCurrentView(nextView);
      primeFullTaskCache(nextView);
      if (!localTaskState) {
        updateUserWorkspaceConfig.mutate({
          configId: TASK_LAST_BOARD_VIEW_CONFIG_ID,
          value: nextView,
          workspaceId: effectiveWorkspaceId,
        });
      }

      if (typeof window !== 'undefined') {
        const currentUrl = new URL(window.location.href);
        if (!currentUrl.pathname.includes('/tasks/boards/')) return;

        const params = currentUrl.searchParams;
        if (nextView === 'kanban') {
          params.delete('view');
        } else {
          params.set('view', nextView);
        }
        const nextQuery = params.toString();
        window.history.replaceState(
          window.history.state,
          '',
          `${currentUrl.pathname}${nextQuery ? `?${nextQuery}` : ''}${currentUrl.hash}`
        );
      }
    },
    [
      effectiveWorkspaceId,
      localTaskState,
      primeFullTaskCache,
      updateUserWorkspaceConfig,
      viewIsEnabled,
    ]
  );

  const {
    data: fullTasks = [],
    isFetching: isFullTasksFetching,
    isPending: isFullTasksPending,
    isError: isFullTasksError,
  } = useQuery({
    queryKey: ['tasks-full', board.id, taskFilterKey],
    enabled: !localTaskState && shouldEagerLoadTasks,
    queryFn: fetchBoardTasks,
    refetchOnMount: false,
    staleTime: 5 * 60_000,
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
  const {
    externalTasksCollapsed,
    handleExternalTasksCollapsedChange,
    handleTaskListCollapsedChange,
    kanbanLayoutRestored,
    setTaskListsCollapsed,
    taskListCollapsePreferences,
    taskListsCollapsed,
  } = useKanbanLayoutState({
    boardId: board.id,
    lists: boardLists,
    manualCollapseChangeRef,
    persistCollapsedTaskLists,
    personalWorkspace: workspace.personal,
  });
  useEffect(() => {
    queryClient.setQueryData(['task_lists', board.id], initialTaskLists);
  }, [board.id, initialTaskLists, queryClient]);
  useLayoutEffect(() => {
    const savedConfig = loadBoardConfig(board.id);
    const requestedView =
      typeof window === 'undefined' ||
      !window.location.pathname.includes('/tasks/boards/')
        ? null
        : (new URLSearchParams(window.location.search).get(
            'view'
          ) as ViewType | null);
    const fallbackView = enabledViews?.[0] ?? 'kanban';
    const routeDefaultView =
      defaultView && viewIsEnabled(defaultView) ? defaultView : null;
    const effectiveDefaultView = routeDefaultView ?? fallbackView;
    const initialView =
      requestedView && viewIsEnabled(requestedView) ? requestedView : null;
    if (!savedConfig) {
      setCurrentView(initialView ?? effectiveDefaultView);
      setFilters(
        hideEmptyTaskListsByDefault
          ? { ...DEFAULT_TASK_FILTERS, hideEmptyTaskLists: true }
          : DEFAULT_TASK_FILTERS
      );
      setListStatusFilter('all');
      return;
    }
    setCurrentView(
      initialView ??
        routeDefaultView ??
        (viewIsEnabled(savedConfig.currentView)
          ? savedConfig.currentView
          : effectiveDefaultView)
    );
    const restoredFilters = sanitizeSavedBoardFilters(savedConfig.filters);
    setFilters(
      (savedConfig.filters.hideEmptyTaskLists ?? hideEmptyTaskListsByDefault)
        ? { ...restoredFilters, hideEmptyTaskLists: true }
        : restoredFilters
    );
    setListStatusFilter(sanitizeListStatusFilter(savedConfig.listStatusFilter));
  }, [
    board.id,
    defaultView,
    enabledViews,
    hideEmptyTaskListsByDefault,
    viewIsEnabled,
  ]);
  useEffect(() => {
    const previousPreference = previousHideEmptyPreferenceRef.current;
    previousHideEmptyPreferenceRef.current = hideEmptyTaskListsByDefault;

    if (
      previousPreference === null ||
      previousPreference === hideEmptyTaskListsByDefault
    ) {
      return;
    }

    setFilters((current) => {
      const { hideEmptyTaskLists: _hidden, ...rest } = current;
      return hideEmptyTaskListsByDefault
        ? { ...rest, hideEmptyTaskLists: true }
        : rest;
    });
  }, [hideEmptyTaskListsByDefault]);

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
    const realLists = boardLists
      .filter((list) => !list.deleted)
      .map((list) => {
        const { is_collapsed: _serverCollapsedState, ...baseList } = list;
        const isCollapsed =
          taskListsCollapsed[list.id] ?? list.status === 'closed';

        if (list.status === 'closed') {
          return { ...baseList, is_collapsed: isCollapsed } as TaskList;
        }

        return isCollapsed
          ? ({ ...baseList, is_collapsed: true } as TaskList)
          : (baseList as TaskList);
      });
    return externalStagingList
      ? [externalStagingList, ...realLists]
      : realLists;
  }, [boardLists, externalStagingList, taskListsCollapsed]);

  const {
    data: filteredListCounts,
    isFetching: isFilteredListCountsFetching,
    isPending: isFilteredListCountsPending,
  } = useQuery({
    queryKey: ['task-list-counts', board.id, taskFilterKey],
    enabled:
      !localTaskState &&
      Boolean(
        hasTaskFilters ||
          filters.hideEmptyTaskLists ||
          autoCollapseEmptyTaskLists
      ),
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

  const initialKanbanLayoutReady =
    kanbanLayoutRestored &&
    taskBoardListPreferencesReady &&
    (localTaskState || !pinnedSpecialListsPending) &&
    (localTaskState ||
      ((!shouldEagerLoadTasks || !isFullTasksPending) &&
        ((!hasTaskFilters &&
          !filters.hideEmptyTaskLists &&
          !autoCollapseEmptyTaskLists) ||
          !isFilteredListCountsPending)));

  const recordManualCollapseChange = useAutoCollapseEmptyTaskLists({
    collapsed: taskListsCollapsed,
    enabled: autoCollapseEmptyTaskLists,
    listCounts: localTaskState ? null : filteredListCounts,
    lists: boardLists,
    manualCollapsePreferences: taskListCollapsePreferences,
    setCollapsed: setTaskListsCollapsed,
  });
  manualCollapseChangeRef.current = recordManualCollapseChange;

  const locallyFilteredTasks = useMemo(
    () =>
      sortLocalTasks(
        tasks.filter((task) =>
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
    [board.ticket_prefix, currentUserId, filters, tasks, unprioritizedPosition]
  );

  const localListCounts = useMemo(() => {
    if (!localTaskState || (!hasTaskFilters && !filters.hideEmptyTaskLists))
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
    filters.hideEmptyTaskLists,
    hasTaskFilters,
    localTaskState,
    locallyFilteredTasks,
  ]);

  const statusFilteredLists = useMemo(() => {
    if (listStatusFilter === 'all') return activeLists;

    const stagingLists = activeLists.filter((list) => list.is_external_staging);
    const realLists = activeLists.filter(
      (list) =>
        !list.is_external_staging &&
        listMatchesStatusFilter(list, listStatusFilter)
    );
    return [...stagingLists, ...realLists];
  }, [activeLists, listStatusFilter]);

  const filteredLists = useMemo(() => {
    const listCounts = localTaskState ? localListCounts : filteredListCounts;
    if ((!hasTaskFilters && !filters.hideEmptyTaskLists) || !listCounts)
      return statusFilteredLists;

    const countByListId = new Map(
      listCounts.map((entry) => [entry.list_id, entry.count] as const)
    );

    return statusFilteredLists.filter(
      (list) => (countByListId.get(list.id) ?? 0) > 0
    );
  }, [
    filteredListCounts,
    filters.hideEmptyTaskLists,
    hasTaskFilters,
    localListCounts,
    localTaskState,
    statusFilteredLists,
  ]);

  useEffect(() => {
    if (!hoveredTaskListId) return;

    const stillSelectable = filteredLists.some(
      (list) => list.id === hoveredTaskListId && !list.is_external_staging
    );
    if (!stillSelectable) setHoveredTaskListId(null);
  }, [filteredLists, hoveredTaskListId]);

  const sourceTasks = useMemo(() => {
    if (localTaskState) return locallyFilteredTasks;

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
  }, [
    fullTasks,
    hasServerTaskQuery,
    localTaskState,
    locallyFilteredTasks,
    shouldEagerLoadTasks,
    sourceScope,
    tasks,
  ]);

  const filteredTasks = useMemo(() => {
    const listIds = new Set(filteredLists.map((list) => list.id));
    return isExternalSourceScope
      ? sourceTasks
      : sourceTasks.filter((task) => listIds.has(task.list_id));
  }, [filteredLists, isExternalSourceScope, sourceTasks]);

  const boardSprints = useBoardSprints({
    boardId: board.id,
    enabled: !localTaskState,
    wsId: effectiveWorkspaceId,
  });

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
    // Sprint boards show the running sprint, else the one being planned.
    const showsOnBoard = boardSprints.showsOnBoard;
    if (showsOnBoard) tasks = tasks.filter(showsOnBoard);

    return sortLocalTasks(tasks, filters.sortBy, unprioritizedPosition);
  }, [
    boardSprints.showsOnBoard,
    filteredTasks,
    filters.sortBy,
    taskOverrides,
    unprioritizedPosition,
  ]);

  const handleTaskPartialUpdate = (taskId: string, partial: Partial<Task>) => {
    setTaskOverrides((prev) => ({
      ...prev,
      [taskId]: { ...(prev[taskId] || {}), ...partial },
    }));
  };

  const canCreateTask =
    !readOnly &&
    currentView !== 'drafts' &&
    currentView !== 'recycle_bin' &&
    filteredLists.some((list) => !list.is_external_staging);
  const createTaskInBoard = () => {
    const selectableLists = filteredLists.filter(
      (list) => !list.is_external_staging
    );
    const defaultTargetList =
      selectableLists.find((list) => list.id === board.default_list_id) ??
      selectableLists[0];
    const hoveredTargetList =
      quickCreateTargetList === 'hovered_list'
        ? selectableLists.find((list) => list.id === hoveredTaskListId)
        : undefined;
    const targetList = hoveredTargetList ?? defaultTargetList;
    if (!targetList) return;
    createTask(board.id, targetList.id, selectableLists, filters);
  };
  // Pills count what the board shows: the current sprint, when sprints are on.
  const headerTasks = useMemo(() => {
    const showsOnBoard = boardSprints.showsOnBoard;
    return showsOnBoard ? tasks.filter(showsOnBoard) : tasks;
  }, [boardSprints.showsOnBoard, tasks]);
  const headerData = useBoardHeaderData({
    tasks: headerTasks,
    lists,
    currentUserId,
    workspaceId: effectiveWorkspaceId,
    boardId: board.id,
    enabled: !localTaskState,
  });
  const recycleBinTranslations = useRecycleBinTranslations();

  useHotkey(HOTKEY_CREATE_TASK, createTaskInBoard, {
    enabled: canCreateTask,
    ignoreInputs: true,
    preventDefault: true,
  });

  useHotkeySequence(
    HOTKEY_GO_TO_KANBAN,
    () => {
      handleViewChange('kanban');
    },
    {
      enabled: viewIsEnabled('kanban'),
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
      enabled: viewIsEnabled('list'),
      ignoreInputs: true,
      preventDefault: true,
    }
  );

  useHotkeySequence(
    HOTKEY_GO_TO_MY_TASKS,
    () => {
      handleViewChange('my_tasks');
    },
    {
      enabled: viewIsEnabled('my_tasks'),
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
      enabled: viewIsEnabled('timeline'),
      ignoreInputs: true,
      preventDefault: true,
    }
  );

  useHotkeySequence(
    HOTKEY_GO_TO_DRAFTS,
    () => {
      handleViewChange('drafts');
    },
    {
      enabled: viewIsEnabled('drafts'),
      ignoreInputs: true,
      preventDefault: true,
    }
  );

  useHotkeySequence(
    HOTKEY_GO_TO_RECYCLE_BIN,
    () => {
      handleViewChange('recycle_bin');
    },
    {
      enabled: viewIsEnabled('recycle_bin'),
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
            isLoading={
              !localTaskState &&
              !!filters.searchQuery?.trim() &&
              isFullTasksPending
            }
            isSearchError={!localTaskState && isFullTasksError}
            disableSort={!!filters.sortBy}
            onFiltersChange={setFilters}
            listStatusFilter={listStatusFilter}
            filters={filters}
            isMultiSelectMode={readOnly ? false : isMultiSelectMode}
            setIsMultiSelectMode={readOnly ? () => {} : setIsMultiSelectMode}
            onExternalTasksCollapsedChange={handleExternalTasksCollapsedChange}
            onTaskListCollapsedChange={handleTaskListCollapsedChange}
            specialTaskListPins={specialTaskListPins}
            onSpecialTaskListPinnedChange={handleSpecialTaskListPinnedChange}
            onBulkSelectionActiveChange={setKanbanBulkSelectionActive}
            canUseBoardAssignees={boardAssigneesEnabled}
            assigneeMemberSource={assigneeMemberSource}
            onHoveredTaskListChange={setHoveredTaskListId}
            readOnly={readOnly}
          />
        );
      case 'my_tasks':
        return (
          <div className="h-full overflow-y-auto p-3 sm:p-4">
            <div className="mx-auto max-w-5xl pb-20">
              {currentUserId ? (
                <MyTasksContent
                  disableAutoCreateBoard
                  embedded
                  initialBoard={{
                    id: board.id,
                    name: board.name ?? null,
                  }}
                  initialLists={boardLists}
                  initialListId={board.default_list_id ?? undefined}
                  isPersonal={workspace.personal}
                  userId={currentUserId}
                  wsId={effectiveWorkspaceId}
                />
              ) : null}
            </div>
          </div>
        );
      case 'list':
        return (
          <ListView
            workspaceId={effectiveWorkspaceId}
            boardId={board.id}
            tasks={effectiveTasks}
            lists={filteredLists}
            isPersonalWorkspace={workspace.personal}
            canUseBoardAssignees={boardAssigneesEnabled}
            assigneeMemberSource={assigneeMemberSource}
            preserveTaskOrder={!!filters.sortBy}
            searchQuery={filters.searchQuery}
            readOnly={readOnly}
          />
        );
      case 'timeline':
        return (
          <TimelineBoard
            wsId={effectiveWorkspaceId}
            boardId={board.id}
            tasks={effectiveTasks}
            lists={filteredLists}
            isPersonalWorkspace={workspace.personal}
            canUseBoardAssignees={boardAssigneesEnabled}
            assigneeMemberSource={assigneeMemberSource}
            onTaskPartialUpdate={handleTaskPartialUpdate}
          />
        );
      case 'drafts':
        return (
          <div className="h-full overflow-y-auto p-3 sm:p-4">
            <DraftsPage
              boardId={board.id}
              includeUnassignedForBoard
              wsId={effectiveWorkspaceId}
            />
          </div>
        );
      case 'recycle_bin':
        return (
          <RecycleBinContent
            active
            boardId={board.id}
            className="h-full"
            lists={boardLists}
            translations={recycleBinTranslations}
            wsId={effectiveWorkspaceId}
          />
        );
    }
  };
  const showIdleBottomIsland =
    !readOnly &&
    idleBottomIsland &&
    (currentView !== 'kanban' || !kanbanBulkSelectionActive);
  return (
    <BoardPanelFrame panelSurface={!localTaskState}>
      <KanbanPresentation
        boardId={board.id}
        currentView={currentView}
        header={
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
            isSearching={
              !localTaskState &&
              (isFullTasksFetching || isFilteredListCountsFetching)
            }
            isMultiSelectMode={readOnly ? false : isMultiSelectMode}
            setIsMultiSelectMode={readOnly ? () => {} : setIsMultiSelectMode}
            availableViews={enabledViews ?? undefined}
            hideActions={!canManageBoard || readOnly}
            publicView={publicView}
            readOnly={readOnly}
            titlePrefix={publicHeaderPrefix}
            people={headerData.people}
            unassignedCount={headerData.unassignedCount}
            projectTaskCounts={headerData.projectTaskCounts}
            countsComplete={headerData.countsComplete}
            onCreateTask={canCreateTask ? createTaskInBoard : undefined}
            sprintSlot={
              boardSprints.currentSprint ? (
                <BoardSprintPill
                  boardId={board.id}
                  canManage={canManageBoard && !readOnly}
                  sprints={boardSprints}
                  tasks={tasks}
                  wsId={effectiveWorkspaceId}
                />
              ) : undefined
            }
          />
        }
        initialLayoutReady={initialKanbanLayoutReady}
      >
        {renderView()}
      </KanbanPresentation>
      {showIdleBottomIsland ? idleBottomIsland : null}
    </BoardPanelFrame>
  );
}
