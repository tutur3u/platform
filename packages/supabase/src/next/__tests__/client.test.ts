import { createBrowserClient } from '@supabase/ssr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetBrowserClientCacheForTests } from '../browser-base';
import {
  __resetSupabaseClientDeprecationWarningForTests,
  createClient,
  createClientWithSession,
  createDynamicClient,
  switchClientSession,
} from '../client';
import { getProxyOnlyPublicTableError } from '../protected-tables';

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(),
}));

vi.mock('../common', () => ({
  checkEnvVariables: () => ({
    url: 'https://test.supabase.co',
    key: 'test-key',
  }),
}));

vi.mock('../realtime-log-provider', () => ({
  getRealtimeLogLevel: vi.fn(() => 'info'),
  realtimeLogger: vi.fn(),
}));

describe('Supabase Client', () => {
  const mockSetSession = vi.fn();
  const mockSchemaFrom = vi.fn((table: string) => ({
    schema: 'public',
    table,
  }));
  const mockClient = {
    from: vi.fn((table: string) => ({ table })),
    schema: vi.fn(() => ({
      from: mockSchemaFrom,
    })),
    auth: {
      setSession: mockSetSession,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('SUPABASE_CLIENT_FORCE_BYPASS', 'true');
    __resetSupabaseClientDeprecationWarningForTests();
    __resetBrowserClientCacheForTests();
    (createBrowserClient as any).mockReturnValue(mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    __resetSupabaseClientDeprecationWarningForTests();
    __resetBrowserClientCacheForTests();
  });

  describe('createClient', () => {
    it('creates a typed client, warns once, and wraps proxy-only tables', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const client = createClient();

      expect(createBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-key'
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(() => client.from('mira_accessories')).toThrow(
        getProxyOnlyPublicTableError('mira_accessories')
      );
      expect(() => client.from('workspace_boards')).toThrow(
        getProxyOnlyPublicTableError('workspace_boards')
      );
      expect(client.from('users')).toEqual({ table: 'users' });
      expect(() => client.schema('public').from('mira_accessories')).toThrow(
        getProxyOnlyPublicTableError('mira_accessories')
      );
    });

    it('reuses the same underlying browser client across calls', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      createClient();
      createClient();

      expect(createBrowserClient).toHaveBeenCalledTimes(1);
    });

    it('throws when strict mode is enabled', () => {
      vi.stubEnv('SUPABASE_CLIENT_STRICT_MODE', 'true');

      expect(() => createClient()).toThrow(
        'Deprecated Supabase browser client access is disabled'
      );
    });
  });

  describe('createDynamicClient', () => {
    it('creates an untyped client and still blocks proxy-only tables', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const client = createDynamicClient();

      expect(createBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-key'
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(() => client.from('workspace_calendars')).toThrow(
        getProxyOnlyPublicTableError('workspace_calendars')
      );
      expect(() => client.from('workspace_boards')).toThrow(
        getProxyOnlyPublicTableError('workspace_boards')
      );
    });
  });

  describe('createClientWithSession', () => {
    const mockSession = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      user: { id: 'user-1' },
      expires_at: Date.now() + 3600,
    };

    it('creates a client, sets the session, and wraps proxy-only tables', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockSetSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      const client = await createClientWithSession(mockSession as any);

      expect(createBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-key'
      );
      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      });
      expect(client.from('users')).toEqual({ table: 'users' });
      expect(() => client.from('workspace_calendars')).toThrow(
        getProxyOnlyPublicTableError('workspace_calendars')
      );
    });

    it('creates separate clients for multiple sessions', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockSetSession.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      });

      await createClientWithSession(mockSession as any);
      await createClientWithSession({
        ...mockSession,
        access_token: 'another-token',
      } as any);

      expect(createBrowserClient).toHaveBeenCalledTimes(2);
    });

    it('throws when the injected session fails to apply', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockSetSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Session rejected' },
      });

      await expect(createClientWithSession(mockSession as any)).rejects.toThrow(
        'Failed to set session: Session rejected'
      );
    });
  });

  describe('switchClientSession', () => {
    const mockSession = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      user: { id: 'user-1' },
      expires_at: Date.now() + 3600,
    };

    it('switches session and returns the new session', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const newSession = { ...mockSession, access_token: 'new-access-token' };
      mockSetSession.mockResolvedValue({
        data: { session: newSession },
        error: null,
      });

      const result = await switchClientSession(
        mockClient as any,
        mockSession as any
      );

      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      });
      expect(result).toEqual(newSession);
    });

    it('throws error when setSession fails with error', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockSetSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Token expired' },
      });

      await expect(
        switchClientSession(mockClient as any, mockSession as any)
      ).rejects.toThrow('Failed to switch session: Token expired');
    });

    it('throws error when no session is returned', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockSetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await expect(
        switchClientSession(mockClient as any, mockSession as any)
      ).rejects.toThrow('Failed to switch session: No session returned');
    });

    it('throws when bypass is disabled', async () => {
      vi.stubEnv('SUPABASE_CLIENT_FORCE_BYPASS', 'false');

      await expect(
        switchClientSession(mockClient as any, mockSession as any)
      ).rejects.toThrow(
        'Deprecated Supabase browser client access is disabled'
      );
    });
  });
});
