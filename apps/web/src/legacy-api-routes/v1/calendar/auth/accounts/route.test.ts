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

import { DELETE } from './route';

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
        allowAppSessionAuth: { targetApp: 'calendar' },
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
