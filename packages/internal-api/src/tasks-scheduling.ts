import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { InternalApiClientOptions } from './client';
import {
  encodePathSegment,
  getInternalApiClient,
  withTaskApiBaseUrl,
} from './client';

function getTaskApiClient(options?: InternalApiClientOptions) {
  return getInternalApiClient(withTaskApiBaseUrl(options));
}

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

export interface CurrentUserTaskScheduleResponse {
  calendar_ws_id: string;
  task_ws_id: string;
  task: Pick<
    Task,
    | 'id'
    | 'name'
    | 'total_duration'
    | 'is_splittable'
    | 'min_split_duration_minutes'
    | 'max_split_duration_minutes'
    | 'calendar_hours'
    | 'auto_schedule'
  >;
  scheduling: {
    totalMinutes: number;
    scheduledMinutes: number;
    completedMinutes: number;
    remainingMinutes: number;
    progress: number;
    isFullyScheduled: boolean;
  };
  events: {
    id?: string;
    title?: string;
    start_at?: string;
    end_at?: string;
    color?: string;
    scheduled_minutes: number;
    completed: boolean;
  }[];
}

export async function updateTaskSchedulingSettings(
  wsId: string,
  taskId: string,
  payload: TaskSchedulingUpdatePayload,
  options?: InternalApiClientOptions
) {
  const client = getTaskApiClient(options);
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

export async function getCurrentUserTaskSchedule(
  taskId: string,
  options?: InternalApiClientOptions
) {
  const client = getTaskApiClient(options);
  return client.json<CurrentUserTaskScheduleResponse>(
    `/api/v1/users/me/tasks/${encodePathSegment(taskId)}/schedule`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );
}

export async function updateCurrentUserTaskSchedulingSettings(
  taskId: string,
  payload: CurrentUserTaskSchedulingUpdatePayload,
  options?: InternalApiClientOptions
) {
  const client = getTaskApiClient(options);
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

export type TaskScheduleBatchSettings = Pick<
  Task,
  | 'total_duration'
  | 'is_splittable'
  | 'min_split_duration_minutes'
  | 'max_split_duration_minutes'
  | 'calendar_hours'
  | 'auto_schedule'
>;
export interface TaskScheduleBatchResponse {
  minutesByTaskId: Record<string, number>;
  settingsByTaskId: Record<string, TaskScheduleBatchSettings | null>;
}
/** Bounded sequential chunks avoid replacing one startup fan-out with another. */
export async function getTaskScheduleBatch(
  wsId: string,
  taskIds: string[],
  personal: boolean,
  signal?: AbortSignal,
  options?: InternalApiClientOptions
): Promise<TaskScheduleBatchResponse> {
  const result: TaskScheduleBatchResponse = {
    minutesByTaskId: {},
    settingsByTaskId: {},
  };
  const ids = [...new Set(taskIds)].sort();
  const client = getTaskApiClient(options);
  for (let offset = 0; offset < ids.length; offset += 100) {
    const chunk = await client.json<TaskScheduleBatchResponse>(
      `/api/v1/workspaces/${encodePathSegment(wsId)}/tasks/schedule-batch`,
      {
        method: 'GET',
        cache: 'no-store',
        signal,
        query: { taskIds: ids.slice(offset, offset + 100).join(','), personal },
      }
    );
    Object.assign(result.minutesByTaskId, chunk.minutesByTaskId);
    Object.assign(result.settingsByTaskId, chunk.settingsByTaskId);
  }
  return result;
}
