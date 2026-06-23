import type {
  CalendarConnection,
  TaskWithScheduling,
  WorkspaceCalendar,
} from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { InternalApiClientOptions, InternalApiQuery } from './client';
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

export type CalendarConflictPolicy = 'latest_write_wins';

export interface CalendarSyncPreferencesResponse {
  inboundSyncEnabled: boolean;
  outboundSyncEnabled: boolean;
  conflictPolicy: CalendarConflictPolicy;
  defaultOutboundConnectionId: string | null;
  options: CalendarSourceOption[];
  settingsAvailable: boolean;
}

export interface CalendarSyncPreferencesPayload {
  inboundSyncEnabled?: boolean;
  outboundSyncEnabled?: boolean;
  conflictPolicy?: CalendarConflictPolicy;
  defaultOutboundConnectionId?: string | null;
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

export type WorkspaceCalendarEventsQuery = InternalApiQuery & {
  start_at?: string;
  end_at?: string;
};

export interface WorkspaceCalendarEventsResponse {
  data: CalendarEvent[];
  count: number;
}

export interface WorkspaceCalendarPayload {
  name: string;
  description?: string | null;
  color?: string | null;
  is_enabled?: boolean;
  position?: number;
}

export interface WorkspaceCalendarUpdatePayload
  extends Partial<WorkspaceCalendarPayload> {
  id: string;
}

export interface WorkspaceCalendarsResponse {
  calendars: WorkspaceCalendar[];
  grouped: {
    custom: WorkspaceCalendar[];
    system: WorkspaceCalendar[];
  };
  total: number;
}

export interface CalendarResetResponse {
  authTokensDeactivated: number;
  calendarConnectionsDeleted: number;
  eventsDeleted: number;
  message: string;
  success: true;
}

export interface CalendarCategory {
  id: string;
  ws_id?: string;
  name: string;
  color: string | null;
  position: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CalendarCategoryPayload {
  name: string;
  color?: string | null;
}

export interface CalendarCategoriesResponse {
  categories: CalendarCategory[];
}

export interface CalendarCategoriesReorderPayload {
  categories: Array<{
    id: string;
    position: number;
  }>;
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

export interface CalendarConnectionPayload {
  accessRole?: string;
  authTokenId?: string;
  calendarId: string;
  calendarName: string;
  color?: string | null;
  isEnabled?: boolean;
  syncDeleteEnabled?: boolean;
  syncInboundEnabled?: boolean;
  syncOutboundEnabled?: boolean;
}

export interface CalendarConnectionUpdatePayload
  extends Partial<CalendarConnectionPayload> {
  id?: string;
  wsId?: string;
}

export interface CalendarConnectionResponse {
  connection: CalendarConnection;
}

export interface CalendarAccount {
  id: string;
  provider: 'google' | 'microsoft' | string;
  account_email: string | null;
  account_name: string | null;
  is_active: boolean | null;
  created_at: string | null;
  expires_at: string | null;
}

export interface CalendarAccountsResponse {
  accounts: CalendarAccount[];
  grouped: {
    google: CalendarAccount[];
    microsoft: CalendarAccount[];
  };
  total: number;
}

export interface CalendarAccountDisconnectResponse {
  message: string;
  success: true;
}

export interface CalendarAuthUrlResponse {
  authUrl: string;
}

export interface ProviderCalendar {
  id: string;
  name: string;
  description?: string;
  primary?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  accessRole?: string;
  provider?: 'google' | 'microsoft';
  accountId: string;
  accountEmail?: string | null;
}

export interface ProviderCalendarsResponse {
  accounts: Array<{
    id: string;
    provider?: string;
    email?: string | null;
    name?: string | null;
  }>;
  byAccount: Record<string, ProviderCalendar[]>;
  calendars: ProviderCalendar[];
}

export interface CalendarScheduleStatusResponse {
  lastScheduledAt: string | null;
  lastStatus: string | null;
  lastMessage: string | null;
  statistics: {
    habitsScheduled: number;
    tasksScheduled: number;
    eventsCreated: number;
    bumpedHabits: number;
    windowDays: number;
  };
  schedulableItems: {
    activeHabits: number;
    autoScheduleTasks: number;
  };
  mode: 'personal' | 'workspace';
}

export async function listWorkspaceCalendarEvents(
  wsId: string,
  query: WorkspaceCalendarEventsQuery,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceCalendarEventsResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/events`,
    {
      query,
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceCalendarEvent(
  wsId: string,
  eventId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CalendarEvent>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/events/${encodePathSegment(
      eventId
    )}`,
    {
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceCalendarEvent(
  wsId: string,
  eventId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    message: string;
    linkedTaskId: string | null;
    skippedHabitDate: string | null;
    skippedHabitId: string | null;
  }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/events/${encodePathSegment(
      eventId
    )}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceCalendars(
  wsId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceCalendarsResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendars`,
    {
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceCalendar(
  wsId: string,
  payload: WorkspaceCalendarPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceCalendar>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendars`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function updateWorkspaceCalendar(
  wsId: string,
  payload: WorkspaceCalendarUpdatePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceCalendar>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendars`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function deleteWorkspaceCalendar(
  wsId: string,
  calendarId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendars`,
    {
      method: 'DELETE',
      query: { id: calendarId },
      cache: 'no-store',
    }
  );
}

export async function resetWorkspaceCalendars(
  wsId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CalendarResetResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendars/reset`,
    {
      method: 'POST',
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceCalendarCategories(
  wsId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CalendarCategoriesResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/categories`,
    {
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceCalendarCategory(
  wsId: string,
  payload: CalendarCategoryPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ category: CalendarCategory }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/categories`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function updateWorkspaceCalendarCategory(
  wsId: string,
  categoryId: string,
  payload: CalendarCategoryPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ category: CalendarCategory }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/categories/${encodePathSegment(
      categoryId
    )}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function deleteWorkspaceCalendarCategory(
  wsId: string,
  categoryId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/categories/${encodePathSegment(
      categoryId
    )}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function reorderWorkspaceCalendarCategories(
  wsId: string,
  payload: CalendarCategoriesReorderPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CalendarCategoriesResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/categories/reorder`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
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

export async function createCalendarConnection(
  wsId: string,
  payload: CalendarConnectionPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.json<CalendarConnectionResponse>(
    '/api/v1/calendar/connections',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...payload, wsId }),
    }
  );

  return response.connection;
}

export async function updateCalendarConnection(
  payload: CalendarConnectionUpdatePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.json<CalendarConnectionResponse>(
    '/api/v1/calendar/connections',
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  return response.connection;
}

export async function deleteCalendarConnection(
  connectionId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>('/api/v1/calendar/connections', {
    method: 'DELETE',
    query: { id: connectionId },
    cache: 'no-store',
  });
}

export async function listCalendarAccounts(
  wsId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CalendarAccountsResponse>(
    '/api/v1/calendar/auth/accounts',
    {
      query: { wsId },
      cache: 'no-store',
    }
  );
}

export async function disconnectCalendarAccount(
  wsId: string,
  accountId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CalendarAccountDisconnectResponse>(
    '/api/v1/calendar/auth/accounts',
    {
      method: 'DELETE',
      query: { accountId, wsId },
      cache: 'no-store',
    }
  );
}

export async function getGoogleCalendarAuthUrl(
  wsId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CalendarAuthUrlResponse>('/api/v1/calendar/auth', {
    query: { wsId },
    cache: 'no-store',
  });
}

export async function getMicrosoftCalendarAuthUrl(
  wsId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CalendarAuthUrlResponse>(
    '/api/v1/calendar/auth/microsoft',
    {
      query: { wsId },
      cache: 'no-store',
    }
  );
}

export async function listProviderCalendars(
  wsId: string,
  query?: { accountId?: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ProviderCalendarsResponse>(
    '/api/v1/calendar/auth/provider-calendars',
    {
      query: { wsId, accountId: query?.accountId },
      cache: 'no-store',
    }
  );
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

export async function getWorkspaceCalendarSyncPreferences(
  wsId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CalendarSyncPreferencesResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/sync-preferences`,
    {
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceCalendarSyncPreferences(
  wsId: string,
  payload: CalendarSyncPreferencesPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CalendarSyncPreferencesResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/sync-preferences`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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

export async function getWorkspaceCalendarScheduleStatus(
  wsId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CalendarScheduleStatusResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/schedule`,
    {
      cache: 'no-store',
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
