import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { InternalApiClientOptions } from './client';
import { encodePathSegment, getInternalApiClient } from './client';

export interface TaskSchedulingUpdatePayload {
  total_duration?: number | null;
  is_splittable?: boolean | null;
  min_split_duration_minutes?: number | null;
  max_split_duration_minutes?: number | null;
  calendar_hours?: Task['calendar_hours'] | null;
  auto_schedule?: boolean;
  priority?: TaskPriority | null;
}

export type CurrentUserTaskSchedulingUpdatePayload = Omit<
  TaskSchedulingUpdatePayload,
  'priority'
>;

export interface CurrentUserTaskSchedulingUpdateResponse {
  ok: true;
  task_ws_id: string;
}

export async function updateTaskSchedulingSettings(
  wsId: string,
  taskId: string,
  payload: TaskSchedulingUpdatePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<Task>(
    `/api/${encodePathSegment(wsId)}/task/${encodePathSegment(taskId)}/edit`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function updateCurrentUserTaskSchedulingSettings(
  taskId: string,
  payload: CurrentUserTaskSchedulingUpdatePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CurrentUserTaskSchedulingUpdateResponse>(
    `/api/v1/users/me/tasks/${encodePathSegment(taskId)}/schedule`,
    {
      method: 'PATCH',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}
