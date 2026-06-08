import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, fullSyncMock, resolveAuthenticatedSessionUserMock } =
  vi.hoisted(() => ({
    createClientMock: vi.fn(),
    fullSyncMock: vi.fn(),
    resolveAuthenticatedSessionUserMock: vi.fn(),
  }));

vi.mock('@tuturuuu/google', () => ({
  OAuth2Client: vi.fn(function OAuth2Client(this: {
    getToken: (code: string) => Promise<{
      tokens: {
        access_token: string;
        expiry_date: number;
        refresh_token: string;
        token_type: string;
      };
    }>;
    setCredentials: (tokens: unknown) => void;
  }) {
    this.getToken = vi.fn(async () => ({
      tokens: {
        access_token: 'access-token',
        expiry_date: Date.now() + 3600_000,
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
      },
    }));
    this.setCredentials = vi.fn();
  }),
  google: {
    calendar: vi.fn(() => ({
      calendarList: {
        list: vi.fn(async () => ({ data: { items: [] } })),
      },
    })),
    oauth2: vi.fn(() => ({
      userinfo: {
        get: vi.fn(async () => ({
          data: {
            email: 'person@example.com',
            name: 'Person Example',
          },
        })),
      },
    })),
  },
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: resolveAuthenticatedSessionUserMock,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: createClientMock,
}));

vi.mock('@tuturuuu/trigger/google-calendar-full-sync', () => ({
  performFullSyncForWorkspace: fullSyncMock,
}));

import { GET } from './route';

function createSupabaseClient() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'calendar_auth_tokens') {
        let selection = '';
        const query = {
          eq: () => query,
          insert: vi.fn(async () => ({ error: null })),
          is: () => query,
          select: (nextSelection: string) => {
            selection = nextSelection;
            return query;
          },
          single: vi.fn(async () => {
            if (selection === 'id') {
              return { data: { id: 'token-id' }, error: null };
            }

            return {
              data: null,
              error: { code: 'PGRST116', message: 'No rows found' },
            };
          }),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        };

        return query;
      }

      if (table === 'calendar_connections') {
        return {
          upsert: vi.fn(async () => ({ error: null })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe('Google Calendar OAuth callback route', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    createClientMock.mockResolvedValue(createSupabaseClient());
    fullSyncMock.mockResolvedValue([]);
    resolveAuthenticatedSessionUserMock.mockResolvedValue({
      authError: null,
      user: { id: 'user-1' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects wildcard listener callbacks back to the public Web origin', async () => {
    vi.stubEnv('GOOGLE_REDIRECT_URI', '');

    const response = await GET(
      new Request(
        'http://0.0.0.0:7803/api/v1/calendar/auth/callback?code=abc&state=workspace-1'
      )
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/workspace-1/calendar?provider=google&connected=true'
    );
  });
});
