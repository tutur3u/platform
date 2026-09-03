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

  it('returns 500 when non-personal workspace normalization fails', async () => {
    const supabase = { rpc: vi.fn() };
    resolveSessionAuthContextMock.mockResolvedValue({
      ok: true,
      supabase,
      user: { id: 'user-1' },
    });
    const normalizationError = new Error('lookup failed');
    normalizeWorkspaceIdMock.mockRejectedValue(normalizationError);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const result = await authorizeCalendarEventManagement(
      new Request('http://localhost/api'),
      'workspace-handle'
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
      'Failed to normalize workspace identifier',
      normalizationError
    );
  });

  it.each([
    ['missing', null, 404, 'Personal workspace not found'],
    [
      'lookup failure',
      { message: 'database unavailable' },
      500,
      'Failed to resolve workspace',
    ],
  ])(
    'distinguishes a personal workspace %s',
    async (_, queryError, expectedStatus, expectedMessage) => {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: queryError,
      });
      const eqType = vi.fn(() => ({ maybeSingle }));
      const eqUser = vi.fn(() => ({ eq: eqType }));
      const eqPersonal = vi.fn(() => ({ eq: eqUser }));
      const select = vi.fn(() => ({ eq: eqPersonal }));
      const supabase = {
        from: vi.fn(() => ({ select })),
        rpc: vi.fn(),
      };
      resolveSessionAuthContextMock.mockResolvedValue({
        ok: true,
        supabase,
        user: { id: 'user-1' },
      });
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
      expect(await result.error.json()).toEqual({ error: expectedMessage });
      expect(normalizeWorkspaceIdMock).not.toHaveBeenCalled();
      if (queryError) {
        expect(consoleError).toHaveBeenCalledWith(
          'Failed to resolve personal workspace',
          { error: queryError }
        );
      }
    }
  );
});
