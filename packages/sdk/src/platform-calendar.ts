import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiQuery,
} from '@tuturuuu/internal-api/client';
import type { WorkspaceCalendar } from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { TuturuuuUserClient } from './platform';
import type {
  CalendarAccountDisconnectResponse,
  CalendarAccountsResponse,
  CalendarAuthUrlResponse,
  CalendarCategoriesReorderPayload,
  CalendarCategoriesResponse,
  CalendarCategory,
  CalendarCategoryPayload,
  CalendarConnectionPayload,
  CalendarConnectionResponse,
  CalendarConnectionsResponse,
  CalendarConnectionUpdatePayload,
  CalendarDefaultSourceResponse,
  CalendarResetResponse,
  CalendarScheduleStatusResponse,
  CalendarSourceInput,
  ProviderCalendarsResponse,
  SchedulableTasksResponse,
  ScheduleApplyRequestPayload,
  SchedulePreviewRequestPayload,
  WorkspaceCalendarEventCreatePayload,
  WorkspaceCalendarEventsQuery,
  WorkspaceCalendarEventsResponse,
  WorkspaceCalendarEventUpdatePayload,
  WorkspaceCalendarPayload,
  WorkspaceCalendarsResponse,
  WorkspaceCalendarUpdatePayload,
} from './platform-calendar-types';

export type {
  CalendarAccount,
  CalendarAccountDisconnectResponse,
  CalendarAccountsResponse,
  CalendarAuthUrlResponse,
  CalendarCategoriesReorderPayload,
  CalendarCategoriesResponse,
  CalendarCategory,
  CalendarCategoryPayload,
  CalendarConnectionPayload,
  CalendarConnectionResponse,
  CalendarConnectionsResponse,
  CalendarConnectionUpdatePayload,
  CalendarDefaultSourceResponse,
  CalendarResetResponse,
  CalendarScheduleStatusResponse,
  CalendarSourceInput,
  CalendarSourceOption,
  ProviderCalendar,
  ProviderCalendarsResponse,
  SchedulableTasksResponse,
  ScheduleApplyRequestPayload,
  SchedulePreviewRequestPayload,
  WorkspaceCalendarEventCreatePayload,
  WorkspaceCalendarEventsQuery,
  WorkspaceCalendarEventsResponse,
  WorkspaceCalendarEventUpdatePayload,
  WorkspaceCalendarPayload,
  WorkspaceCalendarsResponse,
  WorkspaceCalendarUpdatePayload,
} from './platform-calendar-types';

export class CalendarClient {
  constructor(private readonly client: TuturuuuUserClient) {}

  private api<T>(
    path: string,
    init: {
      body?: unknown;
      method?: string;
      query?: InternalApiQuery;
    } = {}
  ) {
    const apiClient = getInternalApiClient(this.client.getClientOptions());
    return apiClient.json<T>(path, {
      method: init.method,
      query: init.query,
      ...(init.body === undefined
        ? {}
        : {
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(init.body),
          }),
      cache: 'no-store',
    });
  }

  listEvents(workspaceId: string, query: WorkspaceCalendarEventsQuery) {
    return this.api<WorkspaceCalendarEventsResponse>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar/events`,
      { query }
    );
  }

  getEvent(workspaceId: string, eventId: string) {
    return this.api<CalendarEvent>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar/events/${encodePathSegment(
        eventId
      )}`
    );
  }

  createEvent(
    workspaceId: string,
    payload: WorkspaceCalendarEventCreatePayload
  ) {
    return this.api<CalendarEvent>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar/events`,
      { body: payload, method: 'POST' }
    );
  }

  updateEvent(
    workspaceId: string,
    eventId: string,
    payload: WorkspaceCalendarEventUpdatePayload
  ) {
    return this.api<CalendarEvent>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar/events/${encodePathSegment(
        eventId
      )}`,
      { body: payload, method: 'PUT' }
    );
  }

  deleteEvent(workspaceId: string, eventId: string) {
    return this.api<{
      message: string;
      linkedTaskId: string | null;
      skippedHabitDate: string | null;
      skippedHabitId: string | null;
    }>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar/events/${encodePathSegment(
        eventId
      )}`,
      { method: 'DELETE' }
    );
  }

  listCalendars(workspaceId: string) {
    return this.api<WorkspaceCalendarsResponse>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendars`
    );
  }

  createCalendar(workspaceId: string, payload: WorkspaceCalendarPayload) {
    return this.api<WorkspaceCalendar>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendars`,
      { body: payload, method: 'POST' }
    );
  }

  updateCalendar(workspaceId: string, payload: WorkspaceCalendarUpdatePayload) {
    return this.api<WorkspaceCalendar>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendars`,
      { body: payload, method: 'PATCH' }
    );
  }

  deleteCalendar(workspaceId: string, calendarId: string) {
    return this.api<{ success: true }>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendars`,
      { method: 'DELETE', query: { id: calendarId } }
    );
  }

  resetCalendars(workspaceId: string) {
    return this.api<CalendarResetResponse>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendars/reset`,
      { method: 'POST' }
    );
  }

  listCategories(workspaceId: string) {
    return this.api<CalendarCategoriesResponse>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar/categories`
    );
  }

  createCategory(workspaceId: string, payload: CalendarCategoryPayload) {
    return this.api<{ category: CalendarCategory }>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar/categories`,
      { body: payload, method: 'POST' }
    );
  }

  updateCategory(
    workspaceId: string,
    categoryId: string,
    payload: CalendarCategoryPayload
  ) {
    return this.api<{ category: CalendarCategory }>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar/categories/${encodePathSegment(
        categoryId
      )}`,
      { body: payload, method: 'PATCH' }
    );
  }

  deleteCategory(workspaceId: string, categoryId: string) {
    return this.api<{ message: string }>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar/categories/${encodePathSegment(
        categoryId
      )}`,
      { method: 'DELETE' }
    );
  }

  reorderCategories(
    workspaceId: string,
    payload: CalendarCategoriesReorderPayload
  ) {
    return this.api<CalendarCategoriesResponse>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar/categories/reorder`,
      { body: payload, method: 'PUT' }
    );
  }

  listAccounts(workspaceId: string) {
    return this.api<CalendarAccountsResponse>(
      '/api/v1/calendar/auth/accounts',
      { query: { wsId: workspaceId } }
    );
  }

  disconnectAccount(workspaceId: string, accountId: string) {
    return this.api<CalendarAccountDisconnectResponse>(
      '/api/v1/calendar/auth/accounts',
      { method: 'DELETE', query: { accountId, wsId: workspaceId } }
    );
  }

  getGoogleAuthUrl(workspaceId: string) {
    return this.api<CalendarAuthUrlResponse>('/api/v1/calendar/auth', {
      query: { wsId: workspaceId },
    });
  }

  getMicrosoftAuthUrl(workspaceId: string) {
    return this.api<CalendarAuthUrlResponse>(
      '/api/v1/calendar/auth/microsoft',
      { query: { wsId: workspaceId } }
    );
  }

  listProviderCalendars(workspaceId: string, query?: { accountId?: string }) {
    return this.api<ProviderCalendarsResponse>(
      '/api/v1/calendar/auth/provider-calendars',
      { query: { wsId: workspaceId, accountId: query?.accountId } }
    );
  }

  listConnections(workspaceId: string) {
    return this.api<CalendarConnectionsResponse>(
      '/api/v1/calendar/connections',
      { query: { wsId: workspaceId } }
    ).then((response) => response.connections ?? []);
  }

  createConnection(workspaceId: string, payload: CalendarConnectionPayload) {
    return this.api<CalendarConnectionResponse>(
      '/api/v1/calendar/connections',
      {
        body: { ...payload, wsId: workspaceId },
        method: 'POST',
      }
    ).then((response) => response.connection);
  }

  updateConnection(payload: CalendarConnectionUpdatePayload) {
    return this.api<CalendarConnectionResponse>(
      '/api/v1/calendar/connections',
      { body: payload, method: 'PATCH' }
    ).then((response) => response.connection);
  }

  deleteConnection(connectionId: string) {
    return this.api<{ success: true }>('/api/v1/calendar/connections', {
      method: 'DELETE',
      query: { id: connectionId },
    });
  }

  getDefaultSource(workspaceId: string) {
    return this.api<CalendarDefaultSourceResponse>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar/default-source`
    );
  }

  updateDefaultSource(workspaceId: string, source: CalendarSourceInput) {
    return this.api<CalendarDefaultSourceResponse>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar/default-source`,
      { body: { source }, method: 'PATCH' }
    );
  }

  getScheduleStatus(workspaceId: string) {
    return this.api<CalendarScheduleStatusResponse>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar/schedule`
    );
  }

  listSchedulableTasks(workspaceId: string, query?: { q?: string }) {
    return this.api<SchedulableTasksResponse>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar/schedulable-tasks`,
      { query }
    );
  }

  previewSchedule<TResponse>(
    workspaceId: string,
    payload: SchedulePreviewRequestPayload
  ) {
    return this.api<TResponse>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar/schedule/preview`,
      { body: payload, method: 'POST' }
    );
  }

  applySchedule<TResponse>(
    workspaceId: string,
    payload: ScheduleApplyRequestPayload
  ) {
    return this.api<TResponse>(
      `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar/schedule`,
      { body: payload, method: 'POST' }
    );
  }
}
