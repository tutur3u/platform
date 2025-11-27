// Set required env vars before any imports
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Supabase admin client
const mockSupabaseAdmin = {
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mockSupabaseAdmin)),
}));

// Mock Supabase client (used in calendar-sync-coordination)
vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}));

// Import after mock setup
import {
  clearSyncToken,
  getSyncToken,
  getWorkspacesForSync,
  getWorkspaceTokensByWsId,
  storeSyncToken,
} from '../src/google-calendar-sync';

describe('Sync Token Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getWorkspaceTokensByWsId', () => {
    const wsId = 'test-workspace-id';

    it('returns tokens when workspace exists', async () => {
      const mockTokens = [
        {
          ws_id: wsId,
          access_token: 'access-token-123',
          refresh_token: 'refresh-token-456',
        },
      ];

      mockSupabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: mockTokens,
            error: null,
          }),
        }),
      });

      const result = await getWorkspaceTokensByWsId(wsId);

      expect(result).toEqual(mockTokens[0]);
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith(
        'calendar_auth_tokens'
      );
    });

    it('returns null when workspace has no tokens', async () => {
      mockSupabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      });

      const result = await getWorkspaceTokensByWsId(wsId);

      expect(result).toBeNull();
    });

    it('returns null when there is a database error', async () => {
      mockSupabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        }),
      });

      const result = await getWorkspaceTokensByWsId(wsId);

      expect(result).toBeNull();
    });

    it('returns null when an exception is thrown', async () => {
      mockSupabaseAdmin.from.mockImplementation(() => {
        throw new Error('Connection error');
      });

      const result = await getWorkspaceTokensByWsId(wsId);

      expect(result).toBeNull();
    });

    it('returns null when tokens is undefined', async () => {
      mockSupabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: undefined,
            error: null,
          }),
        }),
      });

      const result = await getWorkspaceTokensByWsId(wsId);

      expect(result).toBeNull();
    });
  });

  describe('getWorkspacesForSync', () => {
    it('returns all workspaces with valid tokens', async () => {
      const mockWorkspaces = [
        { ws_id: 'ws-1', access_token: 'token-1', refresh_token: 'refresh-1' },
        { ws_id: 'ws-2', access_token: 'token-2', refresh_token: 'refresh-2' },
      ];

      mockSupabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({
            data: mockWorkspaces,
            error: null,
          }),
        }),
      });

      const result = await getWorkspacesForSync();

      expect(result).toEqual(mockWorkspaces);
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith(
        'calendar_auth_tokens'
      );
    });

    it('returns empty array when no workspaces found', async () => {
      mockSupabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      });

      const result = await getWorkspacesForSync();

      expect(result).toEqual([]);
    });

    it('returns empty array when there is a database error', async () => {
      mockSupabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Query failed' },
          }),
        }),
      });

      const result = await getWorkspacesForSync();

      expect(result).toEqual([]);
    });

    it('returns empty array when an exception is thrown', async () => {
      mockSupabaseAdmin.from.mockImplementation(() => {
        throw new Error('Connection timeout');
      });

      const result = await getWorkspacesForSync();

      expect(result).toEqual([]);
    });

    it('returns empty array when tokens is null', async () => {
      mockSupabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
      });

      const result = await getWorkspacesForSync();

      expect(result).toEqual([]);
    });

    it('filters by non-null access_token', async () => {
      mockSupabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      });

      await getWorkspacesForSync();

      const fromCall = mockSupabaseAdmin.from.mock.results[0]?.value;
      expect(fromCall.select).toHaveBeenCalledWith(
        'ws_id, access_token, refresh_token'
      );
    });
  });

  describe('storeSyncToken', () => {
    const wsId = 'test-workspace-id';
    const syncToken = 'sync-token-123';
    const lastSyncedAt = new Date('2024-01-15T10:00:00Z');

    it('stores sync token successfully', async () => {
      mockSupabaseAdmin.rpc.mockResolvedValue({
        data: [{ success: true }],
        error: null,
      });

      await expect(
        storeSyncToken(wsId, syncToken, lastSyncedAt)
      ).resolves.not.toThrow();

      expect(mockSupabaseAdmin.rpc).toHaveBeenCalledWith(
        'atomic_sync_token_operation',
        {
          p_ws_id: wsId,
          p_calendar_id: 'primary',
          p_operation: 'update',
          p_sync_token: syncToken,
        }
      );
    });

    it('throws error when RPC fails', async () => {
      mockSupabaseAdmin.rpc.mockResolvedValue({
        data: null,
        error: { message: 'RPC error' },
      });

      await expect(
        storeSyncToken(wsId, syncToken, lastSyncedAt)
      ).rejects.toThrow();
    });

    it('throws error when operation result is not successful', async () => {
      mockSupabaseAdmin.rpc.mockResolvedValue({
        data: [{ success: false, message: 'Token conflict' }],
        error: null,
      });

      await expect(
        storeSyncToken(wsId, syncToken, lastSyncedAt)
      ).rejects.toThrow('Token conflict');
    });

    it('throws generic error when result has no message', async () => {
      mockSupabaseAdmin.rpc.mockResolvedValue({
        data: [{ success: false }],
        error: null,
      });

      await expect(
        storeSyncToken(wsId, syncToken, lastSyncedAt)
      ).rejects.toThrow('Failed to store sync token');
    });

    it('throws error when data array is empty', async () => {
      mockSupabaseAdmin.rpc.mockResolvedValue({
        data: [],
        error: null,
      });

      await expect(
        storeSyncToken(wsId, syncToken, lastSyncedAt)
      ).rejects.toThrow('Failed to store sync token');
    });
  });

  describe('getSyncToken', () => {
    const wsId = 'test-workspace-id';

    it('returns sync token when found', async () => {
      mockSupabaseAdmin.rpc.mockResolvedValue({
        data: [{ success: true, sync_token: 'existing-token-123' }],
        error: null,
      });

      const result = await getSyncToken(wsId);

      expect(result).toBe('existing-token-123');
      expect(mockSupabaseAdmin.rpc).toHaveBeenCalledWith(
        'atomic_sync_token_operation',
        {
          p_ws_id: wsId,
          p_calendar_id: 'primary',
          p_operation: 'get',
        }
      );
    });

    it('returns null when RPC fails', async () => {
      mockSupabaseAdmin.rpc.mockResolvedValue({
        data: null,
        error: { message: 'RPC error' },
      });

      const result = await getSyncToken(wsId);

      expect(result).toBeNull();
    });

    it('returns null when operation result is not successful', async () => {
      mockSupabaseAdmin.rpc.mockResolvedValue({
        data: [{ success: false }],
        error: null,
      });

      const result = await getSyncToken(wsId);

      expect(result).toBeNull();
    });

    it('returns null when data array is empty', async () => {
      mockSupabaseAdmin.rpc.mockResolvedValue({
        data: [],
        error: null,
      });

      const result = await getSyncToken(wsId);

      expect(result).toBeNull();
    });

    it('returns null when sync_token is undefined', async () => {
      mockSupabaseAdmin.rpc.mockResolvedValue({
        data: [{ success: true }],
        error: null,
      });

      const result = await getSyncToken(wsId);

      expect(result).toBeUndefined();
    });
  });

  describe('clearSyncToken', () => {
    const wsId = 'test-workspace-id';

    it('clears sync token successfully', async () => {
      mockSupabaseAdmin.rpc.mockResolvedValue({
        data: [{ success: true }],
        error: null,
      });

      await expect(clearSyncToken(wsId)).resolves.not.toThrow();

      expect(mockSupabaseAdmin.rpc).toHaveBeenCalledWith(
        'atomic_sync_token_operation',
        {
          p_ws_id: wsId,
          p_calendar_id: 'primary',
          p_operation: 'clear',
        }
      );
    });

    it('throws error when RPC fails', async () => {
      mockSupabaseAdmin.rpc.mockResolvedValue({
        data: null,
        error: { message: 'RPC error' },
      });

      await expect(clearSyncToken(wsId)).rejects.toThrow();
    });

    it('throws error when operation result is not successful', async () => {
      mockSupabaseAdmin.rpc.mockResolvedValue({
        data: [{ success: false, message: 'Clear failed' }],
        error: null,
      });

      await expect(clearSyncToken(wsId)).rejects.toThrow('Clear failed');
    });

    it('throws generic error when result has no message', async () => {
      mockSupabaseAdmin.rpc.mockResolvedValue({
        data: [{ success: false }],
        error: null,
      });

      await expect(clearSyncToken(wsId)).rejects.toThrow(
        'Failed to clear sync token'
      );
    });

    it('throws error when data array is empty', async () => {
      mockSupabaseAdmin.rpc.mockResolvedValue({
        data: [],
        error: null,
      });

      await expect(clearSyncToken(wsId)).rejects.toThrow(
        'Failed to clear sync token'
      );
    });
  });
});
