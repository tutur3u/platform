import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAdminClientMock,
  createClientMock,
  createGraphClientMock,
  fetchMicrosoftEventsMock,
  performIncrementalActiveSyncMock,
  resolveAuthenticatedSessionUserMock,
  verifyWorkspaceMembershipTypeMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  createClientMock: vi.fn(),
  createGraphClientMock: vi.fn(),
  fetchMicrosoftEventsMock: vi.fn(),
  performIncrementalActiveSyncMock: vi.fn(),
  resolveAuthenticatedSessionUserMock: vi.fn(),
  verifyWorkspaceMembershipTypeMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
  createClient: createClientMock,
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: resolveAuthenticatedSessionUserMock,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: verifyWorkspaceMembershipTypeMock,
}));

vi.mock('@/lib/calendar/incremental-active-sync', () => ({
  performIncrementalActiveSync: performIncrementalActiveSyncMock,
}));

vi.mock('@tuturuuu/microsoft', () => ({
  createGraphClient: createGraphClientMock,
}));

vi.mock('@tuturuuu/microsoft/calendar', () => ({
  convertMicrosoftEventToWorkspaceFormat: vi.fn(),
  fetchMicrosoftEvents: fetchMicrosoftEventsMock,
}));

import { POST } from './route';

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const WS_ID = '071e0fc7-9aa8-42d8-92e5-cc9b3aeec2f1';

function createAwaitableQuery<T>(result: T) {
  const query: Record<string, unknown> = {
    eq: () => query,
    gte: () => query,
    error: (result as { error?: unknown }).error,
    in: () => query,
    limit: () => query,
    lt: () => query,
    lte: () => query,
    maybeSingle: async () => result,
    not: () => query,
    order: () => query,
    select: () => query,
    single: async () => result,
    ...(typeof result === 'object' && result ? result : {}),
  };

  return query;
}

function createAdminSupabaseMock() {
  const tokenRows = [
    {
      id: 'google-token-id',
      provider: 'google',
      access_token: 'google-access-token',
      is_active: true,
      ws_id: WS_ID,
    },
    {
      id: 'microsoft-token-id',
      provider: 'microsoft',
      access_token: 'microsoft-access-token',
      is_active: true,
      ws_id: WS_ID,
    },
  ];
  const connectionRows = [
    {
      auth_token_id: 'google-token-id',
      calendar_id: 'primary',
      is_enabled: true,
      workspace_calendar_id: 'google-workspace-calendar-id',
      ws_id: WS_ID,
    },
    {
      auth_token_id: 'microsoft-token-id',
      calendar_id: 'microsoft-calendar-id',
      is_enabled: true,
      workspace_calendar_id: 'microsoft-workspace-calendar-id',
      ws_id: WS_ID,
    },
  ];

  const createFilteredQuery = <T extends Record<string, unknown>>(
    rows: T[]
  ) => {
    const filters = new Map<string, unknown>();
    const inFilters = new Map<string, unknown[]>();
    const query: Record<string, unknown> = {
      eq: (column: string, value: unknown) => {
        filters.set(column, value);
        return query;
      },
      get data() {
        return rows.filter((row) => {
          for (const [column, value] of filters.entries()) {
            if (row[column] !== value) return false;
          }

          for (const [column, values] of inFilters.entries()) {
            if (!values.includes(row[column])) return false;
          }

          return true;
        });
      },
      error: null,
      in: (column: string, values: unknown[]) => {
        inFilters.set(column, values);
        return query;
      },
      not: () => query,
      select: () => query,
    };

    return query;
  };

  return {
    schema: vi.fn((schema: string) => ({
      from: vi.fn((table: string) => {
        if (
          schema === 'private' &&
          table === 'calendar_user_workspace_preferences'
        ) {
          return createAwaitableQuery({
            data: {
              conflict_policy: 'latest_write_wins',
              default_outbound_calendar_connection_id: null,
              inbound_sync_enabled: true,
              outbound_sync_enabled: false,
            },
            error: null,
          });
        }

        if (schema === 'private' && table === 'workspace_calendars') {
          return createAwaitableQuery({
            data: [
              {
                calendar_type: 'primary',
                color: 'BLUE',
                id: 'primary-workspace-calendar-id',
                is_enabled: true,
                name: 'Primary',
              },
            ],
            error: null,
          });
        }

        return createAwaitableQuery({ data: [], error: null });
      }),
    })),
    from: vi.fn((table: string) => {
      if (table === 'workspaces') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { creator_id: 'creator-user-id' },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'calendar_connections') {
        return createFilteredQuery(connectionRows);
      }

      if (table === 'calendar_auth_tokens') {
        return createFilteredQuery(tokenRows);
      }

      if (table === 'calendar_sync_dashboard') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: { id: 'dashboard-run-id' },
                error: null,
              }),
            }),
          }),
          select: () =>
            createAwaitableQuery({
              data: [],
              error: null,
            }),
          update: () =>
            createAwaitableQuery({
              data: null,
              error: null,
            }),
        };
      }

      return createAwaitableQuery({ data: [], error: null });
    }),
  };
}

describe('workspace calendar sync route', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret';
    vi.clearAllMocks();
    createAdminClientMock.mockResolvedValue(createAdminSupabaseMock());
    createGraphClientMock.mockReturnValue('graph-client');
    fetchMicrosoftEventsMock.mockResolvedValue([]);
    performIncrementalActiveSyncMock.mockResolvedValue({
      eventsDeleted: 0,
      eventsInserted: 1,
      eventsUpdated: 2,
    });
  });

  afterEach(() => {
    if (ORIGINAL_CRON_SECRET === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    }
  });

  it('uses the resolved workspace creator as the cron Google sync fallback user', async () => {
    const response = await POST(
      new Request(`http://localhost/api/v1/workspaces/${WS_ID}/calendar/sync`, {
        body: JSON.stringify({ direction: 'inbound', source: 'cron' }),
        headers: {
          Authorization: 'Bearer cron-secret',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }) as never,
      {
        params: Promise.resolve({ wsId: WS_ID }),
      }
    );

    expect(response.status).toBe(200);
    expect(performIncrementalActiveSyncMock).toHaveBeenCalledWith(
      WS_ID,
      'creator-user-id',
      'primary',
      expect.any(Date),
      expect.any(Date),
      undefined,
      'google-token-id',
      'google-workspace-calendar-id',
      { syncDeletes: true }
    );
    expect(performIncrementalActiveSyncMock).toHaveBeenCalledTimes(1);
    expect(createGraphClientMock).toHaveBeenCalledWith(
      'microsoft-access-token'
    );
    expect(fetchMicrosoftEventsMock).toHaveBeenCalledWith(
      'graph-client',
      'microsoft-calendar-id',
      expect.any(String),
      expect.any(String)
    );
  });
});
