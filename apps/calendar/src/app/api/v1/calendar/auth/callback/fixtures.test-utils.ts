import { vi } from 'vitest';

interface ExistingCalendarToken {
  id: string;
  refresh_token: string | null;
  created_at?: string;
  is_active?: boolean;
  deactivated_reason?: string | null;
  deactivated_at?: string | null;
}

export function createTokenResponse(
  refreshToken: string | null = 'refresh-token'
) {
  return {
    tokens: {
      access_token: 'access-token',
      expiry_date: Date.now() + 3600_000,
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
      token_type: 'Bearer',
    },
  };
}

export function createSupabaseClient({
  existingToken = null,
  updateMatches = true,
}: {
  existingToken?: ExistingCalendarToken | null;
  updateMatches?: boolean;
} = {}) {
  const calendarConnectionsUpsertMock = vi.fn(async () => ({ error: null }));
  const tokenInsertMock = vi.fn(async () => ({ error: null }));
  // The update chain records its filters; `updateMatches: false` simulates
  // a guarded write that lost to a concurrent quarantine.
  const tokenUpdateFilters: Array<[string, unknown]> = [];
  const tokenUpdateChain = {
    eq: vi.fn((column: string, value: unknown) => {
      tokenUpdateFilters.push([column, value]);
      return tokenUpdateChain;
    }),
    is: vi.fn((column: string, value: unknown) => {
      tokenUpdateFilters.push([`is.${column}`, value]);
      return tokenUpdateChain;
    }),
    select: vi.fn(async () => ({
      data: updateMatches ? [{ id: existingToken?.id ?? 'token-id' }] : [],
      error: null,
    })),
  };
  const tokenUpdateEqMock = tokenUpdateChain.eq;
  const tokenUpdateMock = vi.fn(() => tokenUpdateChain);

  const client = {
    from: vi.fn((table: string) => {
      if (table === 'calendar_auth_tokens') {
        let selection = '';
        const query = {
          eq: () => query,
          insert: tokenInsertMock,
          is: () => query,
          select: (nextSelection: string) => {
            selection = nextSelection;
            return query;
          },
          single: vi.fn(async () => {
            if (selection === 'id') {
              return {
                data: { id: existingToken?.id ?? 'token-id' },
                error: null,
              };
            }

            if (existingToken) {
              return { data: existingToken, error: null };
            }

            return {
              data: null,
              error: { code: 'PGRST116', message: 'No rows found' },
            };
          }),
          update: tokenUpdateMock,
        };

        return query;
      }

      if (table === 'calendar_connections') {
        return {
          upsert: calendarConnectionsUpsertMock,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    calendarConnectionsUpsertMock,
    client,
    tokenInsertMock,
    tokenUpdateEqMock,
    tokenUpdateFilters,
    tokenUpdateMock,
  };
}
