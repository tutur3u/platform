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
