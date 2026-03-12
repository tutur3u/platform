import { createBrowserClient } from '@supabase/ssr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetSupabaseClientDeprecationWarningForTests,
  createClient,
  createClientWithSession,
  createDynamicClient,
  switchClientSession,
} from '../client';

// Mock the environment variables and browser client creation
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
  const mockClient = {
    auth: {
      setSession: mockSetSession,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('SUPABASE_CLIENT_FORCE_BYPASS', 'true');
    __resetSupabaseClientDeprecationWarningForTests();
    (createBrowserClient as any).mockReturnValue(mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    __resetSupabaseClientDeprecationWarningForTests();
  });

  describe('createClient', () => {
    it('should create a typed client with createClient', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      createClient();

      expect(createBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-key'
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('should throw when strict mode is enabled', () => {
      vi.stubEnv('SUPABASE_CLIENT_STRICT_MODE', 'true');

      expect(() => createClient()).toThrow(
        'Deprecated Supabase browser client access is disabled'
      );
    });
  });

  describe('createDynamicClient', () => {
    it('should create an untyped client with createDynamicClient', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      createDynamicClient();

      expect(createBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-key'
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('createClientWithSession', () => {
    const mockSession = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      user: { id: 'user-1' },
      expires_at: Date.now() + 3600,
    };

    it('should create a client and set the session', async () => {
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

      expect(client).toBe(mockClient);
    });

    it('should create separate clients for multiple sessions', async () => {
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

    it('should throw when the injected session fails to apply', async () => {
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

    it('should switch session and return the new session', async () => {
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

    it('should throw error when setSession fails with error', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockSetSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Token expired' },
      });

      await expect(
        switchClientSession(mockClient as any, mockSession as any)
      ).rejects.toThrow('Failed to switch session: Token expired');
    });

    it('should throw error when no session is returned', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockSetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await expect(
        switchClientSession(mockClient as any, mockSession as any)
      ).rejects.toThrow('Failed to switch session: No session returned');
    });

    it('should throw when bypass is disabled', async () => {
      vi.stubEnv('SUPABASE_CLIENT_FORCE_BYPASS', 'false');

      await expect(
        switchClientSession(mockClient as any, mockSession as any)
      ).rejects.toThrow(
        'Deprecated Supabase browser client access is disabled'
      );
    });
  });
});
