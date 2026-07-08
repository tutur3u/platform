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
import {
  getPersonalExternalStagingListId,
  priorityCompare,
  type WorkspaceLabel,
} from '@tuturuuu/utils/task-helper';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { useUserConfig } from '../../../../hooks/use-user-config';
import {
  useUpdateUserWorkspaceConfig,
  useUserWorkspaceConfig,
} from '../../../../hooks/use-user-workspace-config';
import { KanbanBoard } from '../boards/boardId/kanban';
import type {
  KanbanDeadlineCollapsedState,
  KanbanDeadlineSection,
} from '../boards/boardId/kanban/rendering/kanban-deadline-panels';
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
  parseSpecialTaskListPins,
  type SpecialTaskListPin,
  serializeSpecialTaskListPins,
} from './special-task-list-pins';
import {
  DEFAULT_TASK_QUICK_CREATE_TARGET_LIST,
  normalizeTaskQuickCreateTargetList,
} from './task-quick-create-target-list';

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
const EXTERNAL_TASKS_COLLAPSED_STORAGE_PREFIX =
  'personal-board-external-tasks-collapsed';
const CLOSED_TASK_LIST_COLLAPSED_STORAGE_PREFIX =
  'task-board-closed-list-collapsed';
const DEADLINE_SECTION_COLLAPSED_STORAGE_PREFIX =
  'task-board-deadline-section-collapsed';
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

function getClosedTaskListCollapsedStorageKey(boardId: string, listId: string) {
  return `${CLOSED_TASK_LIST_COLLAPSED_STORAGE_PREFIX}:${boardId}:${listId}`;
}

function getDeadlineSectionCollapsedStorageKey(
  boardId: string,
  section: KanbanDeadlineSection
) {
  return `${DEADLINE_SECTION_COLLAPSED_STORAGE_PREFIX}:${boardId}:${section}`;
}

function taskMatchesLocalFilters(
  task: Task,
  filters: TaskFilters,
  currentUserId?: string
) {
  const query = filters.searchQuery?.trim().toLowerCase();
  if (query) {
    const searchableText = [
      task.name,
      task.display_number ? String(task.display_number) : null,
      ...(task.labels ?? []).map((label) => label.name),
      ...(task.projects ?? []).map((project) => project.name),
      ...(task.assignees ?? []).map(
        (assignee) => assignee.display_name ?? assignee.email ?? assignee.handle
      ),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (!searchableText.includes(query)) return false;
  }

  if (
    filters.labels.length > 0 &&
    !filters.labels.every((label) =>
      task.labels?.some((taskLabel) => taskLabel.id === label.id)
    )
  ) {
    return false;
  }

  if (
    filters.projects.length > 0 &&
    !filters.projects.every((project) =>
      task.projects?.some((taskProject) => taskProject.id === project.id)
    )
  ) {
    return false;
  }

  if (
    filters.priorities.length > 0 &&
    (!task.priority || !filters.priorities.includes(task.priority))
  ) {
    return false;
  }

  if (filters.assignees.length > 0) {
    const assigneeIds = new Set(
      filters.assignees.map((assignee) => assignee.id)
    );
    if (!task.assignees?.some((assignee) => assigneeIds.has(assignee.id))) {
      return false;
    }
  }

  if (
    filters.includeMyTasks &&
    currentUserId &&
    !task.assignees?.some((assignee) => assignee.id === currentUserId)
  ) {
    return false;
  }

  if (filters.includeUnassigned && (task.assignees?.length ?? 0) > 0) {
    return false;
  }

  if (filters.dueDateRange?.from || filters.dueDateRange?.to) {
    if (!task.end_date) return false;
    const dueTime = new Date(task.end_date).getTime();
    const fromTime = filters.dueDateRange.from?.getTime() ?? -Infinity;
    const toTime = filters.dueDateRange.to?.getTime() ?? Infinity;
    if (dueTime < fromTime || dueTime > toTime) return false;
  }

  if (
    typeof filters.estimationRange?.min === 'number' ||
    typeof filters.estimationRange?.max === 'number'
  ) {
    const estimate = task.estimation_points ?? 0;
    const min = filters.estimationRange.min ?? -Infinity;
    const max = filters.estimationRange.max ?? Infinity;
    if (estimate < min || estimate > max) return false;
  }

  return true;
}

function getTaskTimestamp(value: string | null | undefined) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function sortLocalTasks(tasks: Task[], sortBy: TaskFilters['sortBy']) {
  if (!sortBy) return tasks;

  return [...tasks].sort((a, b) => {
    switch (sortBy) {
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      case 'priority-high':
        return priorityCompare(a.priority ?? null, b.priority ?? null);
      case 'priority-low':
        return priorityCompare(b.priority ?? null, a.priority ?? null);
      case 'due-date-asc':
        return getTaskTimestamp(a.end_date) - getTaskTimestamp(b.end_date);
      case 'due-date-desc':
        return getTaskTimestamp(b.end_date) - getTaskTimestamp(a.end_date);
      case 'created-date-asc':
        return getTaskTimestamp(a.created_at) - getTaskTimestamp(b.created_at);
      case 'created-date-desc':
        return getTaskTimestamp(b.created_at) - getTaskTimestamp(a.created_at);
      case 'estimation-high':
        return (b.estimation_points ?? 0) - (a.estimation_points ?? 0);
      case 'estimation-low':
        return (a.estimation_points ?? 0) - (b.estimation_points ?? 0);
      default:
        return 0;
    }
  });
}

interface Props {
  workspace: Workspace;
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
  const t = useTranslations('common');
  const tTasks = useTranslations('ws-tasks');
  const tBoards = useTranslations('ws-task-boards');
  const queryClient = useQueryClient();
  const effectiveWorkspaceId = board.ws_id ?? workspace.id;
  const [currentView, setCurrentView] = useState<ViewType>('kanban');
  const [externalTasksCollapsed, setExternalTasksCollapsed] = useState(false);
  const [closedTaskListsCollapsed, setClosedTaskListsCollapsed] = useState<
    Record<string, boolean>
  >({});
  const [deadlineSectionsCollapsed, setDeadlineSectionsCollapsed] =
    useState<KanbanDeadlineCollapsedState>({});
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_TASK_FILTERS);
  const [listStatusFilter, setListStatusFilter] =
    useState<ListStatusFilter>('all');
  // Local per-session optimistic overrides (e.g., timeline resize) so switching views preserves changes
  const [taskOverrides, setTaskOverrides] = useState<
    Record<string, Partial<Task>>
  >({});
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [kanbanBulkSelectionActive, setKanbanBulkSelectionActive] =
    useState(false);
  const [hoveredTaskListId, setHoveredTaskListId] = useState<string | null>(
    null
  );
  const { createTask } = useTaskDialog();
  const localTaskState = readOnly || publicView;
  const { data: quickCreateTargetListRaw } = useUserConfig(
    TASK_QUICK_CREATE_TARGET_LIST_CONFIG_ID,
    DEFAULT_TASK_QUICK_CREATE_TARGET_LIST,
    { enabled: !localTaskState }
  );
  const quickCreateTargetList = normalizeTaskQuickCreateTargetList(
    quickCreateTargetListRaw
  );
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
  const { data: pinnedSpecialListsRaw } = useUserWorkspaceConfig(
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
  const deadlineTaskQueryOptions = useMemo<ListWorkspaceTasksOptions>(() => {
    const { sortBy: _sortBy, ...filterOptions } = taskQueryOptions;
    return {
      ...filterOptions,
      listStatuses: listStatusesForQuery,
    };
  }, [listStatusesForQuery, taskQueryOptions]);
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
  const fetchBoardTasks = useCallback(async () => {
    const result = await listWorkspaceTasks(effectiveWorkspaceId, {
      ...taskQueryOptions,
      boardId: board.id,
      includeRelationshipSummary: false,
      listStatuses: listStatusesForQuery,
      limit: 200,
    });
    return result.tasks;
  }, [board.id, effectiveWorkspaceId, listStatusesForQuery, taskQueryOptions]);

  const primeFullTaskCache = useCallback(
    (nextView: ViewType) => {
      if (localTaskState) return;
      if (nextView !== 'list' && nextView !== 'timeline') return;

      void queryClient.prefetchQuery({
        queryKey: ['tasks-full', board.id, taskFilterKey],
        queryFn: fetchBoardTasks,
        staleTime: 0,
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

  const { data: fullTasks = [], isFetching: isFullTasksFetching } = useQuery({
    queryKey: ['tasks-full', board.id, taskFilterKey],
    enabled: !localTaskState && shouldEagerLoadTasks,
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
      setFilters(DEFAULT_TASK_FILTERS);
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
    setFilters({
      ...DEFAULT_TASK_FILTERS,
      ...savedConfig.filters,
    });
    setListStatusFilter(savedConfig.listStatusFilter);
  }, [board.id, defaultView, enabledViews, viewIsEnabled]);

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

    setExternalTasksCollapsed(storedPreference ?? true);
  }, [board.id, workspace.personal]);

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

  useEffect(() => {
    const closedLists = boardLists.filter(
      (list) => !list.deleted && list.status === 'closed'
    );

    if (closedLists.length === 0) {
      setClosedTaskListsCollapsed({});
      return;
    }

    setClosedTaskListsCollapsed((previous) => {
      const next: Record<string, boolean> = {};

      for (const list of closedLists) {
        const storedValue =
          typeof window === 'undefined'
            ? null
            : window.localStorage.getItem(
                getClosedTaskListCollapsedStorageKey(board.id, list.id)
              );

        next[list.id] =
          storedValue === null
            ? (previous[list.id] ?? true)
            : storedValue === 'true';
      }

      return next;
    });
  }, [board.id, boardLists]);

  const handleTaskListCollapsedChange = useCallback(
    (listId: string, collapsed: boolean) => {
      setClosedTaskListsCollapsed((previous) => ({
        ...previous,
        [listId]: collapsed,
      }));

      if (typeof window === 'undefined') return;

      window.localStorage.setItem(
        getClosedTaskListCollapsedStorageKey(board.id, listId),
        String(collapsed)
      );
    },
    [board.id]
  );

  useEffect(() => {
    setDeadlineSectionsCollapsed((previous) => {
      const next: KanbanDeadlineCollapsedState = {};

      for (const section of ['overdue', 'upcoming'] as const) {
        const storedValue =
          typeof window === 'undefined'
            ? null
            : window.localStorage.getItem(
                getDeadlineSectionCollapsedStorageKey(board.id, section)
              );

        next[section] =
          storedValue === null
            ? (previous[section] ?? true)
            : storedValue === 'true';
      }

      return next;
    });
  }, [board.id]);

  const handleDeadlineSectionCollapsedChange = useCallback(
    (section: KanbanDeadlineSection, collapsed: boolean) => {
      setDeadlineSectionsCollapsed((previous) => ({
        ...previous,
        [section]: collapsed,
      }));

      if (typeof window === 'undefined') return;

      window.localStorage.setItem(
        getDeadlineSectionCollapsedStorageKey(board.id, section),
        String(collapsed)
      );
    },
    [board.id]
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
    const realLists = boardLists
      .filter((list) => !list.deleted)
      .map((list) =>
        list.status === 'closed'
          ? {
              ...list,
              is_collapsed: closedTaskListsCollapsed[list.id] ?? true,
            }
          : list
      );
    return externalStagingList
      ? [externalStagingList, ...realLists]
      : realLists;
  }, [boardLists, closedTaskListsCollapsed, externalStagingList]);

  const effectiveDeadlineSectionsCollapsed =
    useMemo<KanbanDeadlineCollapsedState>(
      () => ({
        overdue: deadlineSectionsCollapsed.overdue,
        upcoming: deadlineSectionsCollapsed.upcoming,
      }),
      [deadlineSectionsCollapsed.overdue, deadlineSectionsCollapsed.upcoming]
    );

  const { data: filteredListCounts, isFetching: isFilteredListCountsFetching } =
    useQuery({
      queryKey: ['task-list-counts', board.id, taskFilterKey],
      enabled: !localTaskState && hasTaskFilters,
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

  const locallyFilteredTasks = useMemo(
    () =>
      sortLocalTasks(
        tasks.filter((task) =>
          taskMatchesLocalFilters(task, filters, currentUserId)
        ),
        filters.sortBy
      ),
    [currentUserId, filters, tasks]
  );

  const localListCounts = useMemo(() => {
    if (!localTaskState || !hasTaskFilters) return null;

    const counts = new Map<string, number>();
    for (const task of locallyFilteredTasks) {
      counts.set(task.list_id, (counts.get(task.list_id) ?? 0) + 1);
    }

    return [...counts.entries()].map(([list_id, count]) => ({
      list_id,
      count,
    }));
  }, [hasTaskFilters, localTaskState, locallyFilteredTasks]);

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
    const listCounts = localTaskState ? localListCounts : filteredListCounts;
    if (!hasTaskFilters || !listCounts) return statusFilteredLists;

    const countByListId = new Map(
      listCounts.map((entry) => [entry.list_id, entry.count] as const)
    );

    return statusFilteredLists.filter(
      (list) => (countByListId.get(list.id) ?? 0) > 0
    );
  }, [
    filteredListCounts,
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
    },
    {
      enabled:
        !readOnly &&
        currentView !== 'drafts' &&
        currentView !== 'recycle_bin' &&
        filteredLists.some((list) => !list.is_external_staging),
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
            isLoading={false}
            disableSort={!!filters.sortBy}
            deadlineTaskQueryOptions={deadlineTaskQueryOptions}
            listStatusFilter={listStatusFilter}
            filters={filters}
            isMultiSelectMode={readOnly ? false : isMultiSelectMode}
            setIsMultiSelectMode={readOnly ? () => {} : setIsMultiSelectMode}
            onExternalTasksCollapsedChange={handleExternalTasksCollapsedChange}
            onTaskListCollapsedChange={handleTaskListCollapsedChange}
            deadlineSectionsCollapsed={effectiveDeadlineSectionsCollapsed}
            onDeadlineSectionCollapsedChange={
              handleDeadlineSectionCollapsedChange
            }
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
              permanentlyDeleted: t('permanently_deleted', {
                count: '{count}',
              }),
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
            wsId={effectiveWorkspaceId}
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
            deadlineTaskQueryOptions={deadlineTaskQueryOptions}
            listStatusFilter={listStatusFilter}
            filters={filters}
            isMultiSelectMode={readOnly ? false : isMultiSelectMode}
            setIsMultiSelectMode={readOnly ? () => {} : setIsMultiSelectMode}
            onExternalTasksCollapsedChange={handleExternalTasksCollapsedChange}
            onTaskListCollapsedChange={handleTaskListCollapsedChange}
            deadlineSectionsCollapsed={effectiveDeadlineSectionsCollapsed}
            onDeadlineSectionCollapsedChange={
              handleDeadlineSectionCollapsedChange
            }
            specialTaskListPins={specialTaskListPins}
            onSpecialTaskListPinnedChange={handleSpecialTaskListPinnedChange}
            onBulkSelectionActiveChange={setKanbanBulkSelectionActive}
            canUseBoardAssignees={boardAssigneesEnabled}
            assigneeMemberSource={assigneeMemberSource}
            readOnly={readOnly}
          />
        );
    }
  };

  const showIdleBottomIsland =
    !readOnly &&
    !!idleBottomIsland &&
    (currentView !== 'kanban' || !kanbanBulkSelectionActive);

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
        isSearching={
          !localTaskState &&
          (isFullTasksFetching || isFilteredListCountsFetching)
        }
        lists={boardLists}
        onUpdate={handleUpdate}
        isMultiSelectMode={readOnly ? false : isMultiSelectMode}
        setIsMultiSelectMode={readOnly ? () => {} : setIsMultiSelectMode}
        availableViews={enabledViews ?? undefined}
        hideActions={!canManageBoard || readOnly}
        publicView={publicView}
        readOnly={readOnly}
        titlePrefix={publicHeaderPrefix}
      />
      <div className="h-full overflow-hidden">{renderView()}</div>
      {showIdleBottomIsland ? idleBottomIsland : null}
    </div>
  );
}
