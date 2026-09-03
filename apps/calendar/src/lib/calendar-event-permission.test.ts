import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAdminClientMock,
  normalizeWorkspaceIdMock,
  resolveSessionAuthContextMock,
  verifyWorkspaceMembershipTypeMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  normalizeWorkspaceIdMock: vi.fn(),
  resolveSessionAuthContextMock: vi.fn(),
  verifyWorkspaceMembershipTypeMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: normalizeWorkspaceIdMock,
  verifyWorkspaceMembershipType: verifyWorkspaceMembershipTypeMock,
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: resolveSessionAuthContextMock,
}));

import { authorizeCalendarEventManagement } from './calendar-event-permission';

describe('authorizeCalendarEventManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['User not authenticated', 401],
    ['Personal workspace not found', 404],
    ['lookup failed', 500],
  ])(
    'returns a controlled error when normalization reports %s',
    async (message, expectedStatus) => {
      const supabase = { rpc: vi.fn() };
      resolveSessionAuthContextMock.mockResolvedValue({
        ok: true,
        supabase,
        user: { id: 'user-1' },
      });
      const normalizationError = new Error(message);
      normalizeWorkspaceIdMock.mockRejectedValue(normalizationError);
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      const result = await authorizeCalendarEventManagement(
        new Request('http://localhost/api'),
        'personal'
      );

      expect('error' in result).toBe(true);
      if (!('error' in result)) throw new Error('Expected an error response');
      expect(result.error.status).toBe(expectedStatus);
      expect(await result.error.json()).toEqual({
        error: expectedStatus === 500 ? 'Failed to resolve workspace' : message,
      });
      expect(verifyWorkspaceMembershipTypeMock).not.toHaveBeenCalled();
      expect(supabase.rpc).not.toHaveBeenCalled();
      expect(createAdminClientMock).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to normalize workspace identifier',
        normalizationError
      );
    }
  );
});
