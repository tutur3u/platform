import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  containsPermission: vi.fn(),
  createClient: vi.fn(),
  getPermissions: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  serverLoggerError: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();

  return {
    ...actual,
    getPermissions: mocks.getPermissions,
    normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  };
});

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: mocks.serverLoggerError,
  },
}));

import { authorizeInfrastructureMigrationExport } from './migration-export-auth';

describe('authorizeInfrastructureMigrationExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: 'client' });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: { id: 'user-1' },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue('normalized-ws');
    mocks.containsPermission.mockReturnValue(true);
    mocks.getPermissions.mockResolvedValue({
      containsPermission: mocks.containsPermission,
    });
  });

  it('returns 401 when the request has no authenticated session user', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValueOnce({
      authError: null,
      user: null,
    });

    const result = await authorizeInfrastructureMigrationExport(
      new Request('http://localhost/api?ws_id=personal'),
      'personal'
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
  });

  it('requires manage_external_migrations in the normalized workspace', async () => {
    mocks.containsPermission.mockReturnValueOnce(false);

    const result = await authorizeInfrastructureMigrationExport(
      new Request('http://localhost/api?ws_id=personal'),
      'personal'
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith('personal', {
      auth: 'client',
    });
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      request: expect.any(Request),
      wsId: 'normalized-ws',
    });
    expect(mocks.containsPermission).toHaveBeenCalledWith(
      'manage_external_migrations'
    );
  });

  it('returns normalized workspace context for authorized callers', async () => {
    const result = await authorizeInfrastructureMigrationExport(
      new Request('http://localhost/api?ws_id=personal'),
      'personal'
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        userId: 'user-1',
        wsId: 'normalized-ws',
      });
    }
  });
});
