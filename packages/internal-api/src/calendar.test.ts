import { describe, expect, it, vi } from 'vitest';
import {
  createCalendarConnection,
  createWorkspaceCalendar,
  createWorkspaceCalendarCategory,
  createWorkspaceCalendarEvent,
  deleteCalendarConnection,
  deleteWorkspaceCalendar,
  deleteWorkspaceCalendarCategory,
  deleteWorkspaceCalendarEvent,
  disconnectCalendarAccount,
  getGoogleCalendarAuthUrl,
  getMicrosoftCalendarAuthUrl,
  getWorkspaceCalendarEvent,
  getWorkspaceCalendarScheduleStatus,
  listCalendarAccounts,
  listCalendarConnections,
  listProviderCalendars,
  listWorkspaceCalendarCategories,
  listWorkspaceCalendarEvents,
  listWorkspaceCalendars,
  reorderWorkspaceCalendarCategories,
  resetWorkspaceCalendars,
  updateCalendarConnection,
  updateWorkspaceCalendar,
  updateWorkspaceCalendarCategory,
  updateWorkspaceCalendarEvent,
} from './calendar';

function createJsonResponse(payload: unknown) {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

describe('calendar internal API helpers', () => {
  const options = (fetchMock: ReturnType<typeof vi.fn>) => ({
    baseUrl: 'https://internal.example.com',
    fetch: fetchMock as unknown as typeof fetch,
  });

  it('lists calendar connections through the centralized calendar API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        connections: [{ id: 'connection-1', calendar_id: 'primary' }],
      })
    );

    const connections = await listCalendarConnections('workspace 1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/calendar/connections?wsId=workspace+1',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(connections).toEqual([
      { id: 'connection-1', calendar_id: 'primary' },
    ]);
  });

  it('calls workspace calendar event helpers with expected route contracts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ data: [], count: 0 }));

    await listWorkspaceCalendarEvents(
      'workspace 1',
      {
        start_at: '2026-06-11T00:00:00.000Z',
        end_at: '2026-06-12T00:00:00.000Z',
      },
      options(fetchMock)
    );
    await getWorkspaceCalendarEvent(
      'workspace 1',
      'event 1',
      options(fetchMock)
    );
    await deleteWorkspaceCalendarEvent(
      'workspace 1',
      'event 1',
      options(fetchMock)
    );
    await createWorkspaceCalendarEvent(
      'workspace 1',
      {
        title: 'Planning',
        start_at: '2026-06-11T00:00:00.000Z',
        end_at: '2026-06-11T01:00:00.000Z',
        color: 'BLUE',
        locked: true,
      },
      options(fetchMock)
    );
    await updateWorkspaceCalendarEvent(
      'workspace 1',
      'event 1',
      {
        end_at: '2026-06-11T02:00:00.000Z',
        locked: true,
      },
      options(fetchMock)
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/workspace%201/calendar/events?start_at=2026-06-11T00%3A00%3A00.000Z&end_at=2026-06-12T00%3A00%3A00.000Z',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/workspace%201/calendar/events/event%201',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/workspace%201/calendar/events/event%201',
      expect.objectContaining({
        cache: 'no-store',
        method: 'DELETE',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/workspaces/workspace%201/calendar/events',
      expect.objectContaining({
        body: JSON.stringify({
          title: 'Planning',
          start_at: '2026-06-11T00:00:00.000Z',
          end_at: '2026-06-11T01:00:00.000Z',
          color: 'BLUE',
          locked: true,
        }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'https://internal.example.com/api/v1/workspaces/workspace%201/calendar/events/event%201',
      expect.objectContaining({
        body: JSON.stringify({
          end_at: '2026-06-11T02:00:00.000Z',
          locked: true,
        }),
        method: 'PUT',
      })
    );
  });

  it('calls workspace calendar admin helpers with expected payloads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ id: 'cal-1' }));

    await listWorkspaceCalendars('ws-1', options(fetchMock));
    await createWorkspaceCalendar(
      'ws-1',
      { name: 'Team', color: 'BLUE', is_enabled: true },
      options(fetchMock)
    );
    await updateWorkspaceCalendar(
      'ws-1',
      { id: 'cal-1', name: 'Team Calendar' },
      options(fetchMock)
    );
    await deleteWorkspaceCalendar('ws-1', 'cal-1', options(fetchMock));
    await resetWorkspaceCalendars('ws-1', options(fetchMock));

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws-1/calendars',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws-1/calendars',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Team',
          color: 'BLUE',
          is_enabled: true,
        }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/ws-1/calendars',
      expect.objectContaining({
        body: JSON.stringify({ id: 'cal-1', name: 'Team Calendar' }),
        method: 'PATCH',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/workspaces/ws-1/calendars?id=cal-1',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'https://internal.example.com/api/v1/workspaces/ws-1/calendars/reset',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('calls calendar category helpers with expected payloads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ categories: [] }));

    await listWorkspaceCalendarCategories('ws-1', options(fetchMock));
    await createWorkspaceCalendarCategory(
      'ws-1',
      { name: 'Focus', color: 'BLUE' },
      options(fetchMock)
    );
    await updateWorkspaceCalendarCategory(
      'ws-1',
      'category-1',
      { name: 'Deep Focus', color: 'PURPLE' },
      options(fetchMock)
    );
    await reorderWorkspaceCalendarCategories(
      'ws-1',
      { categories: [{ id: 'category-1', position: 0 }] },
      options(fetchMock)
    );
    await deleteWorkspaceCalendarCategory(
      'ws-1',
      'category-1',
      options(fetchMock)
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws-1/calendar/categories',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws-1/calendar/categories',
      expect.objectContaining({
        body: JSON.stringify({ name: 'Focus', color: 'BLUE' }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/ws-1/calendar/categories/category-1',
      expect.objectContaining({
        body: JSON.stringify({ name: 'Deep Focus', color: 'PURPLE' }),
        method: 'PATCH',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/workspaces/ws-1/calendar/categories/reorder',
      expect.objectContaining({
        body: JSON.stringify({
          categories: [{ id: 'category-1', position: 0 }],
        }),
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'https://internal.example.com/api/v1/workspaces/ws-1/calendar/categories/category-1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('calls provider account and auth helpers with expected route contracts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ accounts: [], calendars: [] }));

    await listCalendarAccounts('workspace 1', options(fetchMock));
    await disconnectCalendarAccount(
      'workspace 1',
      'account 1',
      options(fetchMock)
    );
    await getGoogleCalendarAuthUrl('workspace 1', options(fetchMock));
    await getMicrosoftCalendarAuthUrl('workspace 1', options(fetchMock));
    await listProviderCalendars(
      'workspace 1',
      { accountId: 'account 1' },
      options(fetchMock)
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/calendar/auth/accounts?wsId=workspace+1',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/calendar/auth/accounts?accountId=account+1&wsId=workspace+1',
      expect.objectContaining({
        cache: 'no-store',
        method: 'DELETE',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/calendar/auth?wsId=workspace+1',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/calendar/auth/microsoft?wsId=workspace+1',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'https://internal.example.com/api/v1/calendar/auth/provider-calendars?wsId=workspace+1&accountId=account+1',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('calls calendar connection mutation helpers with expected payloads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ connection: { id: 'conn-1' } }));

    await createCalendarConnection(
      'ws-1',
      {
        calendarId: 'primary',
        calendarName: 'Primary',
        authTokenId: 'account-1',
        isEnabled: true,
      },
      options(fetchMock)
    );
    await updateCalendarConnection(
      { id: 'conn-1', calendarName: 'Primary Work' },
      options(fetchMock)
    );
    await deleteCalendarConnection('conn-1', options(fetchMock));

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/calendar/connections',
      expect.objectContaining({
        body: JSON.stringify({
          calendarId: 'primary',
          calendarName: 'Primary',
          authTokenId: 'account-1',
          isEnabled: true,
          wsId: 'ws-1',
        }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/calendar/connections',
      expect.objectContaining({
        body: JSON.stringify({
          id: 'conn-1',
          calendarName: 'Primary Work',
        }),
        method: 'PATCH',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/calendar/connections?id=conn-1',
      expect.objectContaining({
        cache: 'no-store',
        method: 'DELETE',
      })
    );
  });

  it('loads calendar schedule status through the workspace schedule endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ lastStatus: 'completed' }));

    await getWorkspaceCalendarScheduleStatus('ws-1', options(fetchMock));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/calendar/schedule',
      expect.objectContaining({ cache: 'no-store' })
    );
  });
});
