import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  containsPermission: vi.fn(),
  getPermissions: vi.fn(),
  resolveWorkspaceIdForPrincipal: vi.fn(),
  resolveSatelliteRequestActor: vi.fn(),
  serverLoggerError: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatelliteRequestActor: mocks.resolveSatelliteRequestActor,
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();

  return {
    ...actual,
    getPermissions: mocks.getPermissions,
    resolveWorkspaceIdForPrincipal: mocks.resolveWorkspaceIdForPrincipal,
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
    mocks.resolveSatelliteRequestActor.mockResolvedValue({
      admin: { auth: 'admin-client' },
      user: { id: 'user-1', email: 'user@tuturuuu.com' },
    });
    mocks.resolveWorkspaceIdForPrincipal.mockResolvedValue('normalized-ws');
    mocks.containsPermission.mockReturnValue(true);
    mocks.getPermissions.mockResolvedValue({
      containsPermission: mocks.containsPermission,
    });
  });

  it('returns 401 when the request has no authenticated session user', async () => {
    mocks.resolveSatelliteRequestActor.mockResolvedValueOnce(null);

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
    expect(mocks.resolveWorkspaceIdForPrincipal).toHaveBeenCalledWith({
      authorizationClient: { auth: 'admin-client' },
      principal: { email: 'user@tuturuuu.com', id: 'user-1' },
      wsId: 'personal',
    });
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: { id: 'user-1', email: 'user@tuturuuu.com' },
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
