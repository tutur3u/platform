import type { QueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { MAX_SAFE_INTEGER_SORT } from '../kanban-constants';
import type { DragCacheSnapshot, TaskSortKeyRepair } from './task-drag-types';
import { getEffectiveTaskSortKey } from './task-sort-key';

const SORT_KEY_BASE_UNIT = 1_000_000;
const SORT_KEY_DEFAULT = SORT_KEY_BASE_UNIT * 1000;
const SORT_KEY_MIN_GAP = 1000;

type SortKeyPlanTask = Pick<
  Task,
  | 'id'
  | 'is_personal_external'
  | 'is_personal_external_default'
  | 'personal_sort_key'
  | 'sort_key'
>;

function getTaskSortKeyInsertionContext({
  activeTaskId,
  orderedTasks,
}: {
  activeTaskId: string;
  orderedTasks: SortKeyPlanTask[];
}) {
  const activeIndex = orderedTasks.findIndex(
    (task) => task.id === activeTaskId
  );
  if (activeIndex === -1) {
    return {
      activeIndex,
      nextSortKey: null,
      previousSortKey: null,
    };
  }

  const nextTask = orderedTasks[activeIndex + 1];
  const previousTask = orderedTasks[activeIndex - 1];

  return {
    activeIndex,
    nextSortKey: nextTask ? getEffectiveTaskSortKey(nextTask) : null,
    previousSortKey: previousTask
      ? getEffectiveTaskSortKey(previousTask)
      : null,
  };
}

function hasRepresentableSortKeyGap(
  previousSortKey: number | null,
  nextSortKey: number | null
) {
  if (previousSortKey === null) {
    return nextSortKey === null || nextSortKey >= SORT_KEY_MIN_GAP;
  }

  if (nextSortKey === null) {
    return true;
  }

  return nextSortKey - previousSortKey >= SORT_KEY_MIN_GAP;
}

function getRepairedSortKeyForIndex(index: number) {
  return (index + 1) * SORT_KEY_BASE_UNIT;
}

function getDeterministicPreviewSortKey({
  nextSortKey,
  previousSortKey,
}: {
  nextSortKey: number | null;
  previousSortKey: number | null;
}) {
  if (previousSortKey === null) {
    if (nextSortKey === null) return SORT_KEY_DEFAULT;
    if (nextSortKey <= 1) return SORT_KEY_DEFAULT;

    const halfNext = Math.floor(nextSortKey / 2);

    if (nextSortKey <= SORT_KEY_MIN_GAP) {
      return Math.max(1, Math.min(halfNext, nextSortKey - 1));
    }

    return Math.max(
      halfNext,
      Math.min(SORT_KEY_BASE_UNIT, nextSortKey - SORT_KEY_MIN_GAP)
    );
  }

  if (nextSortKey === null) {
    return previousSortKey + SORT_KEY_BASE_UNIT;
  }

  const gap = nextSortKey - previousSortKey;

  if (gap <= 1) {
    return previousSortKey + SORT_KEY_BASE_UNIT;
  }

  return Math.floor((previousSortKey + nextSortKey) / 2);
}

function getPreviewSortKeyPlan({
  activeTaskId,
  orderedTasks,
  targetListId,
}: {
  activeTaskId: string;
  orderedTasks: SortKeyPlanTask[];
  targetListId: string;
}): {
  previewSortKey: number;
  repairedTaskSortKeys: TaskSortKeyRepair[];
} {
  const { activeIndex, nextSortKey, previousSortKey } =
    getTaskSortKeyInsertionContext({
      activeTaskId,
      orderedTasks,
    });

  if (activeIndex === -1) {
    return {
      previewSortKey: MAX_SAFE_INTEGER_SORT,
      repairedTaskSortKeys: [],
    };
  }

  const previewSortKey = getDeterministicPreviewSortKey({
    nextSortKey,
    previousSortKey,
  });
  const effectiveOrderedTasks = orderedTasks.map((task) => ({
    ...task,
    effective_sort_key:
      task.id === activeTaskId ? previewSortKey : getEffectiveTaskSortKey(task),
  }));
  const orderNeedsRepair = effectiveOrderedTasks.some((task, index) => {
    if (
      typeof task.effective_sort_key !== 'number' ||
      !Number.isFinite(task.effective_sort_key)
    ) {
      return true;
    }

    const previousTask = effectiveOrderedTasks[index - 1];
    if (!previousTask) return false;

    if (
      typeof previousTask.effective_sort_key !== 'number' ||
      !Number.isFinite(previousTask.effective_sort_key)
    ) {
      return true;
    }

    return (
      task.effective_sort_key - previousTask.effective_sort_key <
      SORT_KEY_MIN_GAP
    );
  });

  if (
    !hasRepresentableSortKeyGap(previousSortKey, nextSortKey) ||
    orderNeedsRepair
  ) {
    return {
      previewSortKey: getRepairedSortKeyForIndex(activeIndex),
      repairedTaskSortKeys: orderedTasks.map((task, index) => ({
        listId: targetListId,
        sortKey: getRepairedSortKeyForIndex(index),
        taskId: task.id,
      })),
    };
  }

  return {
    previewSortKey,
    repairedTaskSortKeys: [],
  };
}

export function getTaskDropPreviewCacheTasks({
  activeTask,
  localMutationAt = Date.now(),
  orderedTasks,
  tasks,
  targetList,
  targetListId,
}: {
  activeTask: Task;
  localMutationAt?: number;
  orderedTasks: Task[];
  tasks: Task[] | undefined;
  targetList: TaskList | undefined;
  targetListId: string;
}) {
  if (!tasks) return { previewSortKey: null, tasks };

  const { previewSortKey, repairedTaskSortKeys } = getPreviewSortKeyPlan({
    activeTaskId: activeTask.id,
    orderedTasks,
    targetListId,
  });
  const repairedSortKeysByTaskId = new Map(
    repairedTaskSortKeys.map((repair) => [repair.taskId, repair.sortKey])
  );
  const mutationTimestamp = new Date(localMutationAt).toISOString();
  const targetIsCompleted = targetList?.status === 'done';
  const targetIsTerminal = targetList?.status === 'closed';

  return {
    previewSortKey,
    repairedTaskSortKeys,
    tasks: tasks.map((task) =>
      task.id === activeTask.id
        ? ({
            ...task,
            list_id: targetListId,
            sort_key: previewSortKey,
            personal_sort_key: task.is_personal_external
              ? previewSortKey
              : task.personal_sort_key,
            completed: targetIsCompleted,
            completed_at: targetIsCompleted
              ? (task.completed_at ?? mutationTimestamp)
              : null,
            closed_at: targetIsTerminal
              ? (task.closed_at ?? mutationTimestamp)
              : null,
            _localMutationAt: localMutationAt,
          } as Task & { _localMutationAt: number })
        : repairedSortKeysByTaskId.has(task.id)
          ? ({
              ...task,
              sort_key: repairedSortKeysByTaskId.get(task.id) ?? task.sort_key,
              personal_sort_key: task.is_personal_external
                ? (repairedSortKeysByTaskId.get(task.id) ??
                  task.personal_sort_key)
                : task.personal_sort_key,
              _localMutationAt: localMutationAt,
            } as Task & { _localMutationAt: number })
          : task
    ),
  };
}

export function applyTaskDropPreviewToCache({
  activeTask,
  boardId,
  orderedTasks,
  queryClient,
  snapshot,
  targetList,
  targetListId,
}: {
  activeTask: Task;
  boardId: string | null;
  orderedTasks: Task[];
  queryClient: QueryClient;
  snapshot: DragCacheSnapshot;
  targetList: TaskList | undefined;
  targetListId: string;
}) {
  if (!boardId) return null;

  const localMutationAt = Date.now();
  const previewTasks = getTaskDropPreviewCacheTasks({
    activeTask,
    localMutationAt,
    orderedTasks,
    tasks: snapshot.tasks,
    targetList,
    targetListId,
  });
  const previewFullTasks = getTaskDropPreviewCacheTasks({
    activeTask,
    localMutationAt,
    orderedTasks,
    tasks: snapshot.fullTasks,
    targetList,
    targetListId,
  });

  if (previewTasks.tasks) {
    queryClient.setQueryData(['tasks', boardId], previewTasks.tasks);
  }

  if (previewFullTasks.tasks) {
    queryClient.setQueryData(['tasks-full', boardId], previewFullTasks.tasks);
  }

  return {
    localMutationAt,
    previousFullTasks: snapshot.fullTasks,
    previousTasks: snapshot.tasks,
    previewSortKey: previewTasks.previewSortKey,
    repairedTaskSortKeys: previewTasks.repairedTaskSortKeys,
  };
}

export function hasTaskLocalMutationAt(
  tasks: Task[] | undefined,
  taskId: string,
  localMutationAt: number
) {
  const task = tasks?.find((item) => item.id === taskId) as
    | (Task & { _localMutationAt?: unknown })
    | undefined;

  return task?._localMutationAt === localMutationAt;
}

export function mergeTaskIntoBoardTaskCache(
  currentTasks: Task[] | undefined,
  nextTask: Task
) {
  const existingTasks = currentTasks ?? [];
  let found = false;

  const mergedTasks = existingTasks.map((task) => {
    if (task.id !== nextTask.id) return task;
    found = true;
    return { ...task, ...nextTask } as Task;
  });

  return found ? mergedTasks : [...mergedTasks, nextTask];
}

export function setBoardTaskCache(
  queryClient: QueryClient,
  boardId: string,
  nextTask: Task
) {
  queryClient.setQueryData(['tasks', boardId], (old: Task[] | undefined) =>
    mergeTaskIntoBoardTaskCache(old, nextTask)
  );

  if (queryClient.getQueryData<Task[]>(['tasks-full', boardId])) {
    queryClient.setQueryData(
      ['tasks-full', boardId],
      (old: Task[] | undefined) => mergeTaskIntoBoardTaskCache(old, nextTask)
    );
  }
}

export function mergePersonalPlacementMutationTask(
  task: Task,
  nextTask: Task & { _localMutationAt: number },
  responseTask: Task | undefined,
  isStagingTarget: boolean
) {
  return {
    ...nextTask,
    ...(responseTask ?? {}),
    assignees: task.assignees,
    labels: task.labels,
    projects: task.projects,
    list_id: responseTask?.list_id ?? nextTask.list_id,
    sort_key: responseTask?.sort_key ?? nextTask.sort_key,
    personal_sort_key:
      responseTask?.personal_sort_key ?? nextTask.personal_sort_key,
    is_personal_external_default: isStagingTarget,
    _localMutationAt: nextTask._localMutationAt,
  } as Task & { _localMutationAt: number };
}
