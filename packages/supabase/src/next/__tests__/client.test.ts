import { createBrowserClient } from '@supabase/ssr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createClient,
  createClientWithSession,
  createDynamicClient,
  switchClientSession,
} from '../client';
import { getProxyOnlyPublicTableError } from '../protected-tables';

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
    from: vi.fn((table: string) => ({ table })),
    auth: {
      setSession: mockSetSession,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createBrowserClient as any).mockReturnValue(mockClient);
  });

  describe('createClient', () => {
    it('should create a typed client with createClient', () => {
      const client = createClient();
      expect(createBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-key'
      );
      expect(client).not.toBe(mockClient);
    });

    it('should block direct access to proxy-only tables', () => {
      const client = createClient();

      expect(() => client.from('tasks')).toThrow(
        getProxyOnlyPublicTableError('tasks')
      );
    });

    it('should allow access to non-proxy-only tables', () => {
      const client = createClient();

      expect(client.from('users')).toEqual({ table: 'users' });
      expect(mockClient.from).toHaveBeenCalledWith('users');
    });
  });

  describe('createDynamicClient', () => {
    it('should create an untyped client with createDynamicClient', () => {
      const client = createDynamicClient();
      expect(createBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-key'
      );
      expect(() => client.from('workspace_whiteboards')).toThrow(
        getProxyOnlyPublicTableError('workspace_whiteboards')
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

    it('should create a client and set the session', async () => {
      mockSetSession.mockResolvedValue({});

      const client = await createClientWithSession(mockSession as any);

      expect(createBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-key'
      );

      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      });

      expect(client).not.toBe(mockClient);
      expect(client.auth).toBe(mockClient.auth);
      expect(client.from('users')).toEqual({ table: 'users' });
      expect(() => client.from('notes')).toThrow(
        getProxyOnlyPublicTableError('notes')
      );
    });

    it('should create separate clients for multiple sessions', async () => {
      mockSetSession.mockResolvedValue({});

      await createClientWithSession(mockSession as any);
      await createClientWithSession({
        ...mockSession,
        access_token: 'another-token',
      } as any);

      expect(createBrowserClient).toHaveBeenCalledTimes(2);
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
      mockSetSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Token expired' },
      });

      await expect(
        switchClientSession(mockClient as any, mockSession as any)
      ).rejects.toThrow('Failed to switch session: Token expired');
    });

    it('should throw error when no session is returned', async () => {
      mockSetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await expect(
        switchClientSession(mockClient as any, mockSession as any)
      ).rejects.toThrow('Failed to switch session: No session returned');
    });
  });
});
