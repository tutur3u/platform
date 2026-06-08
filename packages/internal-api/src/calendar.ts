import type { CalendarConnection, TaskWithScheduling } from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { InternalApiClientOptions } from './client';
import { encodePathSegment, getInternalApiClient } from './client';

export interface WorkspaceCalendarEventUpdatePayload {
  locked?: boolean;
  title?: string;
  description?: string | null;
  location?: string | null;
  start_at?: string;
  end_at?: string;
  color?: string;
  source?: CalendarSourceInput;
}

export type CalendarSourceInput =
  | {
      provider: 'tuturuuu';
      workspaceCalendarId?: string | null;
    }
  | {
      provider: 'google' | 'microsoft';
      connectionId: string;
    };

export type CalendarSourceOption =
  | {
      id: string;
      provider: 'tuturuuu';
      workspaceCalendarId: string;
      label: string;
      color: string | null;
      primary?: boolean;
      writable: boolean;
    }
  | {
      id: string;
      provider: 'google' | 'microsoft';
      connectionId: string;
      workspaceCalendarId: string | null;
      externalCalendarId: string;
      accessRole: string | null;
      accountEmail: string | null;
      accountName: string | null;
      label: string;
      color: string | null;
      writable: boolean;
    };

export interface CalendarDefaultSourceResponse {
  defaultSource: CalendarSourceOption;
  options: CalendarSourceOption[];
}

export interface WorkspaceCalendarEventCreatePayload {
  title: string;
  start_at: string;
  end_at: string;
  description?: string | null;
  location?: string | null;
  color?: string;
  locked?: boolean;
  task_id?: string | null;
  source?: CalendarSourceInput;
}

export interface SchedulePreviewRequestPayload {
  windowDays?: number;
  clientTimezone?: string;
}

export interface ScheduleApplyRequestPayload
  extends SchedulePreviewRequestPayload {
  forceReschedule?: boolean;
  mode?: 'safe-apply' | 'full-apply';
  scope?: 'impacted-only' | 'full-window';
  warnings?: string[];
  summary?: {
    totalEvents: number;
    habitsScheduled: number;
    tasksScheduled: number;
    partiallyScheduledTasks: number;
    unscheduledTasks: number;
  };
  previewEvents?: Array<Record<string, unknown> | unknown>;
}

export interface SchedulableTasksResponse {
  tasks: TaskWithScheduling[];
}

export interface TaskScheduleHistoryEntry {
  event_id: string | null;
  date: string;
  start_at: string | null;
  end_at: string | null;
  scheduled_minutes: number;
  status: 'completed' | 'scheduled' | 'trimmed';
}

export interface TaskScheduleHistoryResponse {
  entries: TaskScheduleHistoryEntry[];
  summary: {
    totalMinutes: number;
    scheduledMinutes: number;
    remainingMinutes: number;
  };
}

export interface HabitScheduleHistoryEntry {
  occurrence_date: string;
  status: 'completed' | 'scheduled' | 'skipped' | 'to_be_scheduled';
  event_id: string | null;
  start_at: string | null;
  end_at: string | null;
  canRevoke: boolean;
  revoked_at?: string | null;
}

export interface HabitScheduleHistoryResponse {
  entries: HabitScheduleHistoryEntry[];
  summary: {
    scheduledCount: number;
    completedCount: number;
    skippedCount: number;
    toBeScheduledCount: number;
  };
}

export interface HabitSkipPayload {
  occurrenceDate: string;
  sourceEventId?: string | null;
}

export interface CalendarConnectionsResponse {
  connections: CalendarConnection[];
}

export async function listCalendarConnections(
  wsId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.json<CalendarConnectionsResponse>(
    '/api/v1/calendar/connections',
    {
      query: { wsId },
      cache: 'no-store',
    }
  );

  return response.connections ?? [];
}

export async function getWorkspaceCalendarDefaultSource(
  wsId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CalendarDefaultSourceResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/default-source`,
    {
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceCalendarDefaultSource(
  wsId: string,
  source: CalendarSourceInput,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CalendarDefaultSourceResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/default-source`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ source }),
    }
  );
}

export async function updateWorkspaceCalendarEvent(
  wsId: string,
  eventId: string,
  payload: WorkspaceCalendarEventUpdatePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CalendarEvent>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/events/${encodePathSegment(
      eventId
    )}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function createWorkspaceCalendarEvent(
  wsId: string,
  payload: WorkspaceCalendarEventCreatePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CalendarEvent>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/events`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function listWorkspaceSchedulableTasks(
  wsId: string,
  query?: { q?: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SchedulableTasksResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/schedulable-tasks`,
    {
      query,
    }
  );
}

export async function previewWorkspaceCalendarSchedule<TResponse>(
  wsId: string,
  payload: SchedulePreviewRequestPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/schedule/preview`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function applyWorkspaceCalendarSchedule<TResponse>(
  wsId: string,
  payload: ScheduleApplyRequestPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/schedule`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function getWorkspaceTaskScheduleHistory(
  wsId: string,
  taskId: string,
  query?: { start?: string; end?: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TaskScheduleHistoryResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/tasks/${encodePathSegment(taskId)}/schedule/history`,
    {
      query,
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceHabitScheduleHistory(
  wsId: string,
  habitId: string,
  query?: { start?: string; end?: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<HabitScheduleHistoryResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/habits/${encodePathSegment(habitId)}/schedule/history`,
    {
      query,
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceHabitSkip(
  wsId: string,
  habitId: string,
  payload: HabitSkipPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true; occurrenceDate: string }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/habits/${encodePathSegment(habitId)}/skips`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function revokeWorkspaceHabitSkip(
  wsId: string,
  habitId: string,
  payload: HabitSkipPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true; occurrenceDate: string }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/habits/${encodePathSegment(habitId)}/skips`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}
