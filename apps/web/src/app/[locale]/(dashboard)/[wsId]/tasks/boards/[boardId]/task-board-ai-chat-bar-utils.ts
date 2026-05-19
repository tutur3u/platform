import type { QueryClient } from '@tanstack/react-query';
import type {
  BoardBroadcastFn,
  BoardRefreshFn,
} from '@tuturuuu/ui/tu-do/shared/board-broadcast-context';
import type { TaskBoardAiChatBarTask } from './task-board-ai-chat-bar-types';

export function mergeCreatedTasks(
  current: TaskBoardAiChatBarTask[] | undefined,
  tasks: TaskBoardAiChatBarTask[]
) {
  const merged = new Map(
    (current ?? []).map((task) => [task.id, task] as const)
  );

  for (const task of tasks) {
    merged.set(task.id, {
      assignees: [],
      labels: [],
      projects: [],
      ...merged.get(task.id),
      ...task,
    });
  }

  return [...merged.values()];
}

export function publishTaskBoardAiCreatedTasks({
  boardId,
  broadcast,
  queryClient,
  refreshActiveBoard,
  tasks,
}: {
  boardId: string;
  broadcast: BoardBroadcastFn | null;
  queryClient: QueryClient;
  refreshActiveBoard: BoardRefreshFn | null;
  tasks: TaskBoardAiChatBarTask[];
}) {
  if (!tasks.length) return;

  queryClient.setQueryData<TaskBoardAiChatBarTask[]>(
    ['tasks', boardId],
    (current) => mergeCreatedTasks(current, tasks)
  );

  if (
    queryClient.getQueryData<TaskBoardAiChatBarTask[]>(['tasks-full', boardId])
  ) {
    queryClient.setQueryData<TaskBoardAiChatBarTask[]>(
      ['tasks-full', boardId],
      (current) => mergeCreatedTasks(current, tasks)
    );
  }

  for (const task of tasks) {
    broadcast?.('task:upsert', { task });
  }

  const tasksWithRelations = tasks
    .filter(
      (task) =>
        (task.assignee_ids?.length ?? 0) > 0 ||
        (task.label_ids?.length ?? 0) > 0 ||
        (task.project_ids?.length ?? 0) > 0
    )
    .map((task) => task.id);

  if (tasksWithRelations.length > 0) {
    broadcast?.('task:relations-changed', { taskIds: tasksWithRelations });
  }

  refreshActiveBoard?.({ invalidateTasks: false });
}
