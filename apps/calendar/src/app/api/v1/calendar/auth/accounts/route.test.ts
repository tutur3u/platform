import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAdminClientMock,
  normalizeWorkspaceIdMock,
  resolveSessionAuthContextMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  normalizeWorkspaceIdMock: vi.fn(),
  resolveSessionAuthContextMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: resolveSessionAuthContextMock,
}));

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: normalizeWorkspaceIdMock,
}));

import { DELETE, GET } from './route';

function createAccountLookupClient() {
  return {
    from: vi.fn((table: string) => {
      if (table !== 'calendar_auth_tokens') {
        throw new Error(`Unexpected table: ${table}`);
      }

      const query = {
        eq: () => query,
        select: () => query,
        single: async () => ({
          data: {
            account_email: 'person@example.com',
            id: 'account-id',
            provider: 'google',
          },
          error: null,
        }),
      };

      return query;
    }),
  };
}

function createAdminClient() {
  const tokenUpdate = vi.fn(() => ({
    eq: () => tokenUpdate(),
  }));
  const connectionUpdate = vi.fn(() => ({
    eq: () => connectionUpdate(),
  }));

  const client = {
    from: vi.fn((table: string) => {
      if (table === 'calendar_auth_tokens') {
        return {
          update: tokenUpdate,
        };
      }

      if (table === 'calendar_connections') {
        return {
          update: connectionUpdate,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    client,
    connectionUpdate,
    tokenUpdate,
  };
}

describe('calendar auth accounts route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeWorkspaceIdMock.mockResolvedValue(
      '071e0fc7-9aa8-42d8-92e5-cc9b3aeec2f1'
    );
    resolveSessionAuthContextMock.mockResolvedValue({
      ok: true,
      supabase: createAccountLookupClient(),
      user: { id: 'user-id' },
    });
  });

  it('disconnects with the admin client and clears stored OAuth secrets', async () => {
    const { client, connectionUpdate, tokenUpdate } = createAdminClient();
    createAdminClientMock.mockResolvedValue(client);

    const response = await DELETE(
      new Request(
        'http://localhost/api/v1/calendar/auth/accounts?accountId=account-id&wsId=personal',
        { method: 'DELETE' }
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(resolveSessionAuthContextMock).toHaveBeenCalledWith(
      expect.any(Request),
      {
        allowAppSessionAuth: { targetApp: ['calendar', 'tasks'] },
      }
    );
    expect(tokenUpdate).toHaveBeenCalledWith({
      access_token: '',
      expires_at: null,
      is_active: false,
      refresh_token: '',
    });
    expect(connectionUpdate).toHaveBeenCalledWith({ is_enabled: false });
  });
});

describe('calendar accounts list', () => {
  // Two reads: active accounts, then quarantined accounts needing reconnect.
  function listClient(quarantine: { data: unknown[] | null; error: unknown }) {
    const reads: Array<Array<[string, unknown]>> = [];
    return {
      reads,
      client: {
        from: vi.fn(() => {
          const filters: Array<[string, unknown]> = [];
          reads.push(filters);
          const query = {
            select: () => query,
            eq: (column: string, value: unknown) => {
              filters.push([column, value]);
              return query;
            },
            not: (column: string, operator: string, value: unknown) => {
              filters.push([`not.${column}.${operator}`, value]);
              return query;
            },
            order: async () =>
              reads.length === 1
                ? {
                    data: [{ id: 'active', provider: 'google' }],
                    error: null,
                  }
                : quarantine,
          };
          return query;
        }),
      },
    };
  }

  beforeEach(() => {
    normalizeWorkspaceIdMock.mockResolvedValue('workspace-id');
  });

  it('returns the caller’s quarantined accounts beside the active ones', async () => {
    const quarantined = {
      id: 'quarantined',
      provider: 'microsoft',
      account_email: 'person@example.com',
      account_name: null,
      deactivated_reason: 'microsoft_consent_revoked',
      deactivated_at: '2026-10-26T03:00:00Z',
    };
    const { client, reads } = listClient({ data: [quarantined], error: null });
    resolveSessionAuthContextMock.mockResolvedValue({
      ok: true,
      supabase: client,
      user: { id: 'user-id' },
    });

    const response = await GET(
      new Request(
        'http://localhost/api/v1/calendar/auth/accounts?wsId=personal'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.needsReconnect).toEqual([quarantined]);
    expect(reads[1]).toEqual([
      ['user_id', 'user-id'],
      ['ws_id', 'workspace-id'],
      ['is_active', false],
      ['not.deactivated_reason.is', null],
    ]);
  });

  it('keeps listing active accounts while the quarantine columns are pending', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client } = listClient({ data: null, error: { code: '42703' } });
    resolveSessionAuthContextMock.mockResolvedValue({
      ok: true,
      supabase: client,
      user: { id: 'user-id' },
    });
    const response = await GET(
      new Request(
        'http://localhost/api/v1/calendar/auth/accounts?wsId=personal'
      )
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      total: 1,
      needsReconnect: [],
    });
  });
});
