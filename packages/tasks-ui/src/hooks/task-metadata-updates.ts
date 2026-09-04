import type { QueryClient } from '@tanstack/react-query';
import {
  updateWorkspaceTask,
  type WorkspaceTaskUpdatePayload,
} from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { getTaskFromVisibleCaches } from '../tu-do/shared/task-cache-patches';

export async function updateTaskMetadata({
  queryClient,
  boardId,
  taskIds,
  payload,
  fallbackTask,
  resolveWorkspaceId,
}: {
  queryClient: QueryClient;
  boardId: string;
  taskIds: string[];
  payload: WorkspaceTaskUpdatePayload;
  fallbackTask?: Task;
  resolveWorkspaceId: (task?: Task) => Promise<string>;
}) {
  const results = await Promise.allSettled(
    taskIds.map(async (taskId) => {
      const cachedTask = getTaskFromVisibleCaches({
        queryClient,
        boardId,
        taskId,
        fallback: taskId === fallbackTask?.id ? fallbackTask : undefined,
      });
      const workspaceId = await resolveWorkspaceId(cachedTask);
      await updateWorkspaceTask(workspaceId, taskId, payload);
      return taskId;
    })
  );

  const succeededTaskIds = results.flatMap((result, index) => {
    const taskId = taskIds[index];
    if (result.status === 'fulfilled' && taskId) return [taskId];
    if (result.status === 'rejected' && taskId) {
      console.error(`Failed to update task ${taskId}:`, result.reason);
    }
    return [];
  });

  return {
    succeededTaskIds,
    failedTaskIds: taskIds.filter((id) => !succeededTaskIds.includes(id)),
  };
}
