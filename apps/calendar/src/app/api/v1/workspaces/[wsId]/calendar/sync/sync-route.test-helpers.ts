import { vi } from 'vitest';

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

export function createSyncAdminSupabaseMock(
  dashboardUpdateMock: (data: unknown) => void,
  {
    additionalGoogleConnections = [],
    completionFailure = false,
    recentRuns = [],
  }: {
    additionalGoogleConnections?: Array<Record<string, unknown>>;
    completionFailure?: boolean;
    recentRuns?: Array<Record<string, unknown>>;
  } = {}
) {
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
      id: 'primary-connection',
      calendar_name: 'Primary',
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
    ...additionalGoogleConnections,
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
      update: () => createAwaitableQuery({ data: null, error: null }),
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
              data: recentRuns,
              error: null,
            }),
          update: (data: unknown) => {
            dashboardUpdateMock(data);
            const status = (data as { status?: string }).status;
            // Mirror the deployed CHECK constraint; 'success' leaves runs stuck.
            const error =
              (status &&
                !['running', 'completed', 'failed'].includes(status)) ||
              (status === 'completed' && completionFailure)
                ? {
                    code: '23514',
                    message: 'calendar_sync_dashboard_status_check',
                  }
                : null;
            return createAwaitableQuery({ data: null, error });
          },
        };
      }

      return createAwaitableQuery({ data: [], error: null });
    }),
  };
}
