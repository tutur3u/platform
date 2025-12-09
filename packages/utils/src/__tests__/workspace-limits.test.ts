import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  checkWorkspaceCreationLimit,
  WORKSPACE_LIMIT_ERROR_CODE,
} from '../workspace-limits';
import { MAX_WORKSPACES_FOR_FREE_USERS } from '../constants';

describe('checkWorkspaceCreationLimit', () => {
  const mockUserId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when user has a Tuturuuu email', () => {
    it('should allow creation for @tuturuuu.com email', async () => {
      const mockSupabase = createMockSupabase({ count: 100, error: null });

      const result = await checkWorkspaceCreationLimit(
        mockSupabase,
        mockUserId,
        'user@tuturuuu.com'
      );

      expect(result.canCreate).toBe(true);
      expect(result.errorCode).toBeUndefined();
    });

    it('should allow creation for @xwf.tuturuuu.com email', async () => {
      const mockSupabase = createMockSupabase({ count: 100, error: null });

      const result = await checkWorkspaceCreationLimit(
        mockSupabase,
        mockUserId,
        'admin@xwf.tuturuuu.com'
      );

      expect(result.canCreate).toBe(true);
    });

    it('should allow creation regardless of workspace count for internal emails', async () => {
      const mockSupabase = createMockSupabase({ count: 1000, error: null });

      const result = await checkWorkspaceCreationLimit(
        mockSupabase,
        mockUserId,
        'test@tuturuuu.com'
      );

      expect(result.canCreate).toBe(true);
      expect(result.currentCount).toBeUndefined();
      expect(result.limit).toBeUndefined();
    });
  });

  describe('when user has a regular email', () => {
    it('should allow creation when under limit', async () => {
      const mockSupabase = createMockSupabase({ count: 5, error: null });

      const result = await checkWorkspaceCreationLimit(
        mockSupabase,
        mockUserId,
        'user@example.com'
      );

      expect(result.canCreate).toBe(true);
      expect(result.currentCount).toBe(5);
      expect(result.limit).toBe(MAX_WORKSPACES_FOR_FREE_USERS);
    });

    it('should allow creation when at zero workspaces', async () => {
      const mockSupabase = createMockSupabase({ count: 0, error: null });

      const result = await checkWorkspaceCreationLimit(
        mockSupabase,
        mockUserId,
        'newuser@gmail.com'
      );

      expect(result.canCreate).toBe(true);
      expect(result.currentCount).toBe(0);
    });

    it('should allow creation when one below limit', async () => {
      const mockSupabase = createMockSupabase({
        count: MAX_WORKSPACES_FOR_FREE_USERS - 1,
        error: null,
      });

      const result = await checkWorkspaceCreationLimit(
        mockSupabase,
        mockUserId,
        'user@example.com'
      );

      expect(result.canCreate).toBe(true);
      expect(result.currentCount).toBe(MAX_WORKSPACES_FOR_FREE_USERS - 1);
    });

    it('should deny creation when at limit', async () => {
      const mockSupabase = createMockSupabase({
        count: MAX_WORKSPACES_FOR_FREE_USERS,
        error: null,
      });

      const result = await checkWorkspaceCreationLimit(
        mockSupabase,
        mockUserId,
        'user@example.com'
      );

      expect(result.canCreate).toBe(false);
      expect(result.currentCount).toBe(MAX_WORKSPACES_FOR_FREE_USERS);
      expect(result.limit).toBe(MAX_WORKSPACES_FOR_FREE_USERS);
      expect(result.errorCode).toBe(WORKSPACE_LIMIT_ERROR_CODE);
      expect(result.errorMessage).toContain(
        `${MAX_WORKSPACES_FOR_FREE_USERS} workspaces`
      );
    });

    it('should deny creation when over limit', async () => {
      const mockSupabase = createMockSupabase({
        count: MAX_WORKSPACES_FOR_FREE_USERS + 5,
        error: null,
      });

      const result = await checkWorkspaceCreationLimit(
        mockSupabase,
        mockUserId,
        'user@example.com'
      );

      expect(result.canCreate).toBe(false);
      expect(result.errorCode).toBe(WORKSPACE_LIMIT_ERROR_CODE);
    });
  });

  describe('when user email is null or undefined', () => {
    it('should check workspace count when email is null', async () => {
      const mockSupabase = createMockSupabase({ count: 5, error: null });

      const result = await checkWorkspaceCreationLimit(
        mockSupabase,
        mockUserId,
        null
      );

      expect(result.canCreate).toBe(true);
      expect(result.currentCount).toBe(5);
    });

    it('should check workspace count when email is undefined', async () => {
      const mockSupabase = createMockSupabase({ count: 5, error: null });

      const result = await checkWorkspaceCreationLimit(
        mockSupabase,
        mockUserId,
        undefined
      );

      expect(result.canCreate).toBe(true);
      expect(result.currentCount).toBe(5);
    });

    it('should deny when at limit with null email', async () => {
      const mockSupabase = createMockSupabase({
        count: MAX_WORKSPACES_FOR_FREE_USERS,
        error: null,
      });

      const result = await checkWorkspaceCreationLimit(
        mockSupabase,
        mockUserId,
        null
      );

      expect(result.canCreate).toBe(false);
      expect(result.errorCode).toBe(WORKSPACE_LIMIT_ERROR_CODE);
    });
  });

  describe('when database query fails', () => {
    it('should return error when count query fails', async () => {
      const mockError = { message: 'Database error', code: 'PGRST500' };
      const mockSupabase = createMockSupabase({
        count: null,
        error: mockError,
      });

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await checkWorkspaceCreationLimit(
        mockSupabase,
        mockUserId,
        'user@example.com'
      );

      expect(result.canCreate).toBe(false);
      expect(result.errorCode).toBe('WORKSPACE_COUNT_ERROR');
      expect(result.errorMessage).toBe('Error checking workspace limit');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('should handle count being null', async () => {
      const mockSupabase = createMockSupabase({ count: null, error: null });

      const result = await checkWorkspaceCreationLimit(
        mockSupabase,
        mockUserId,
        'user@example.com'
      );

      expect(result.canCreate).toBe(true);
      expect(result.currentCount).toBe(0);
    });

    it('should handle empty string email as non-Tuturuuu', async () => {
      const mockSupabase = createMockSupabase({ count: 5, error: null });

      const result = await checkWorkspaceCreationLimit(
        mockSupabase,
        mockUserId,
        ''
      );

      expect(result.canCreate).toBe(true);
      expect(result.currentCount).toBe(5);
    });
  });
});

// Helper function to create mock Supabase client
function createMockSupabase({
  count,
  error,
}: {
  count: number | null;
  error: { message: string; code?: string } | null;
}) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count, error }),
        }),
      }),
    }),
  };
}
