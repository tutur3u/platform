import type { QueryClient } from '@tanstack/react-query';
import { getWorkspaceTask } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { calculateDaysUntilEndOfWeek } from '../../../../utils/weekDateUtils';

export function getInternalApiOptions() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return { baseUrl: window.location.origin };
}

export async function getTaskForRelationMutation(
  queryClient: QueryClient,
  boardId: string,
  wsId: string,
  taskId: string
) {
  const cachedTasks = queryClient.getQueryData(['tasks', boardId]) as
    | Task[]
    | undefined;
  const cachedTask = cachedTasks?.find((task) => task.id === taskId);
  if (cachedTask) {
    return cachedTask;
  }

  try {
    const { task } = await getWorkspaceTask(
      wsId,
      taskId,
      getInternalApiOptions()
    );
    return task as Task;
  } catch {
    return null;
  }
}

export function resolveDueDatePreset(
  preset: 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'clear',
  weekStartsOn: 0 | 1 | 6
) {
  if (preset === 'clear') {
    return null;
  }

  const d = new Date();

  if (preset === 'tomorrow') {
    d.setDate(d.getDate() + 1);
  } else if (preset === 'this_week') {
    d.setDate(d.getDate() + calculateDaysUntilEndOfWeek(weekStartsOn));
  } else if (preset === 'next_week') {
    d.setDate(d.getDate() + calculateDaysUntilEndOfWeek(weekStartsOn) + 7);
  }

  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}
