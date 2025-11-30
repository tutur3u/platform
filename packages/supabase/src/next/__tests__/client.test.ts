import { createBrowserClient } from '@supabase/ssr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
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
    (createBrowserClient as any).mockReturnValue(mockClient);
  });

  describe('createClient', () => {
    it('should create a typed client with createClient', () => {
      createClient();
      expect(createBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-key'
      );
    });
  });

  describe('createDynamicClient', () => {
    it('should create an untyped client with createDynamicClient', () => {
      createDynamicClient();
      expect(createBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-key'
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

      expect(client).toBe(mockClient);
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
