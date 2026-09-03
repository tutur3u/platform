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

  it('returns a controlled error when workspace normalization fails', async () => {
    const supabase = { rpc: vi.fn() };
    resolveSessionAuthContextMock.mockResolvedValue({
      ok: true,
      supabase,
      user: { id: 'user-1' },
    });
    normalizeWorkspaceIdMock.mockRejectedValue(new Error('lookup failed'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const result = await authorizeCalendarEventManagement(
      new Request('http://localhost/api'),
      'personal'
    );

    expect('error' in result).toBe(true);
    if (!('error' in result)) throw new Error('Expected an error response');
    expect(result.error.status).toBe(500);
    expect(await result.error.json()).toEqual({
      error: 'Failed to resolve workspace',
    });
    expect(verifyWorkspaceMembershipTypeMock).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to normalize workspace identifier'
    );
  });
});
