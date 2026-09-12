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
export function getUserTaskDashboard(
  scope: { wsId: string; isPersonal: boolean },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(
    withTaskApiBaseUrl(options)
  ).json<UserTaskDashboard>('/api/v1/users/me/tasks', {
    query: { ...scope, completedLimit: 0 },
    cache: 'no-store',
    credentials: 'include',
  });
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
