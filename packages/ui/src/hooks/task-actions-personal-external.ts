import type { QueryClient } from '@tanstack/react-query';
import {
  listWorkspaceTaskLists,
  updateWorkspaceTask,
  upsertCurrentUserTaskPersonalPlacement,
} from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';

export function isPersonalExternalTask(task?: Task) {
  return (
    task?.is_personal_external === true || Boolean(task?.personal_board_id)
  );
}

function findFirstListByStatus(lists: TaskList[], status: 'done' | 'closed') {
  return lists.find((list) => list.status === status && !list.deleted) ?? null;
}

function mergeTaskIntoCache(current: Task[] | undefined, nextTask: Task) {
  const existing = current ?? [];
  let found = false;
  const merged = existing.map((item) => {
    if (item.id !== nextTask.id) return item;
    found = true;
    return { ...item, ...nextTask } as Task;
  });

  return found ? merged : [...merged, nextTask];
}

function getPersonalPlacementOrder({
  boardId,
  queryClient,
  taskId,
  targetListId,
  position,
}: {
  boardId: string;
  queryClient: QueryClient;
  taskId: string;
  targetListId: string;
  position: 'top' | 'end';
}) {
  const currentTasks =
    queryClient.getQueryData<Task[]>(['tasks', boardId]) ?? [];
  const targetListTasks = currentTasks
    .filter((item) => item.id !== taskId && item.list_id === targetListId)
    .sort((a, b) => {
      const sortA = a.sort_key ?? Number.MAX_SAFE_INTEGER;
      const sortB = b.sort_key ?? Number.MAX_SAFE_INTEGER;
      if (sortA !== sortB) return sortA - sortB;
      if (!a.created_at || !b.created_at) return 0;
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });

  if (position === 'top') {
    return {
      previous_task_id: null,
      next_task_id: targetListTasks[0]?.id ?? null,
    };
  }

  return {
    previous_task_id: targetListTasks[targetListTasks.length - 1]?.id ?? null,
    next_task_id: null,
  };
}

function upsertLocallyMutatedTask({
  boardId,
  markLocallyMutatedTask,
  queryClient,
  task,
}: {
  boardId: string;
  markLocallyMutatedTask: (task: Task) => Task;
  queryClient: QueryClient;
  task: Task;
}) {
  const locallyMutatedTask = markLocallyMutatedTask(task);

  queryClient.setQueryData<Task[]>(['tasks', boardId], (current) =>
    mergeTaskIntoCache(current, locallyMutatedTask)
  );

  if (queryClient.getQueryData<Task[]>(['tasks-full', boardId])) {
    queryClient.setQueryData<Task[]>(['tasks-full', boardId], (current) =>
      mergeTaskIntoCache(current, locallyMutatedTask)
    );
  }
}

export async function moveExternalTaskToPersonalList({
  boardId,
  markLocallyMutatedTask,
  queryClient,
  task,
  targetList,
  sourceStatus,
  placementPosition = 'end',
}: {
  boardId: string;
  markLocallyMutatedTask: (task: Task) => Task;
  queryClient: QueryClient;
  task: Task;
  targetList: TaskList;
  sourceStatus?: 'done' | 'closed';
  placementPosition?: 'top' | 'end';
}) {
  const personalBoardId = task.personal_board_id ?? boardId;
  const sourceWorkspaceId = task.source_workspace_id;
  const sourceBoardId = task.source_board_id;
  const previousTasks = queryClient.getQueryData<Task[]>(['tasks', boardId]);
  const previousFullTasks = queryClient.getQueryData<Task[]>([
    'tasks-full',
    boardId,
  ]);
  const now = new Date().toISOString();
  let sourceTargetList: TaskList | null = null;

  try {
    if (sourceStatus) {
      if (!sourceWorkspaceId || !sourceBoardId) {
        throw new Error('Source board is required');
      }

      const { lists: sourceLists } = await listWorkspaceTaskLists(
        sourceWorkspaceId,
        sourceBoardId
      );
      sourceTargetList = findFirstListByStatus(sourceLists, sourceStatus);

      if (!sourceTargetList) {
        throw new Error(`Source board has no ${sourceStatus} list`);
      }
    }

    const isDoneTarget = targetList.status === 'done';
    const isClosedTarget = targetList.status === 'closed';
    const optimisticTask = {
      ...task,
      list_id: targetList.id,
      personal_board_id: personalBoardId,
      personal_list_id: targetList.id,
      personal_placed_at: now,
      is_personal_external: true,
      is_personal_external_default: false,
      completed_at: isDoneTarget ? now : task.completed_at,
      closed_at: isDoneTarget || isClosedTarget ? now : task.closed_at,
    } as Task;

    upsertLocallyMutatedTask({
      boardId,
      markLocallyMutatedTask,
      queryClient,
      task: optimisticTask,
    });

    const order = getPersonalPlacementOrder({
      boardId,
      queryClient,
      taskId: task.id,
      targetListId: targetList.id,
      position: placementPosition,
    });
    const placementResponse = await upsertCurrentUserTaskPersonalPlacement(
      task.id,
      {
        personal_board_id: personalBoardId,
        personal_list_id: targetList.id,
        previous_task_id: order.previous_task_id,
        next_task_id: order.next_task_id,
      }
    );

    let sourceTask: Task | undefined;

    if (sourceStatus && sourceWorkspaceId && sourceTargetList) {
      const sourceResponse = await updateWorkspaceTask(
        sourceWorkspaceId,
        task.id,
        {
          list_id: sourceTargetList.id,
        }
      );
      sourceTask = sourceResponse.task;
    }

    const placedTask = placementResponse.task as Task;
    upsertLocallyMutatedTask({
      boardId,
      markLocallyMutatedTask,
      queryClient,
      task: {
        ...optimisticTask,
        ...placedTask,
        list_id: targetList.id,
        personal_board_id: personalBoardId,
        personal_list_id: targetList.id,
        personal_sort_key:
          placedTask.personal_sort_key ?? optimisticTask.personal_sort_key,
        sort_key: placedTask.sort_key ?? optimisticTask.sort_key,
        completed_at:
          sourceTask?.completed_at ??
          placedTask.completed_at ??
          optimisticTask.completed_at,
        closed_at:
          sourceTask?.closed_at ??
          placedTask.closed_at ??
          optimisticTask.closed_at,
        source_list_id:
          sourceTargetList?.id ??
          placedTask.source_list_id ??
          task.source_list_id,
        source_list_name:
          sourceTargetList?.name ??
          placedTask.source_list_name ??
          task.source_list_name,
        source_list_status:
          sourceTargetList?.status ??
          placedTask.source_list_status ??
          task.source_list_status,
      } as Task,
    });

    return {
      placementTask: placedTask,
      sourceTask,
      sourceTargetList,
    };
  } catch (error) {
    if (previousTasks) {
      queryClient.setQueryData(['tasks', boardId], previousTasks);
    }
    if (previousFullTasks) {
      queryClient.setQueryData(['tasks-full', boardId], previousFullTasks);
    }
    throw error;
  }
}
