import type { TaskWithRelations } from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withTaskApiBaseUrl,
} from './client';
import type { CurrentUserTaskDialogResponse } from './tasks';

export interface UserTaskDashboard {
  overdue: TaskWithRelations[];
  today: TaskWithRelations[];
  upcoming: TaskWithRelations[];
  totalActiveTasks: number;
}

/** Read the Tasks app feed, including personal overrides and cross-workspace tasks. */
export async function getUserTaskDashboard(
  scope: { wsId: string; isPersonal: boolean },
  options?: InternalApiClientOptions
) {
  const result = await getInternalApiClient(
    withTaskApiBaseUrl(options)
  ).json<UserTaskDashboard>('/api/v1/users/me/tasks', {
    query: { ...scope, completedLimit: 0 },
    cache: 'no-store',
    credentials: 'include',
  });
  const active = (tasks: TaskWithRelations[]) =>
    tasks.filter((task) => {
      const state = task as TaskWithRelations & {
        completed?: boolean | null;
        completed_at?: string | null;
        closed_at?: string | null;
      };
      return !state.completed && !state.completed_at && !state.closed_at;
    });
  const overdue = active(result.overdue);
  const today = active(result.today);
  const upcoming = active(result.upcoming);
  return {
    overdue,
    today,
    upcoming,
    totalActiveTasks: overdue.length + today.length + upcoming.length,
  };
}

export async function getCurrentUserTask(
  taskId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withTaskApiBaseUrl(options));
  return client.json<CurrentUserTaskDialogResponse>(
    `/api/v1/users/me/tasks/${encodePathSegment(taskId)}`,
    {
      cache: 'no-store',
      credentials: 'include',
    }
  );
}
