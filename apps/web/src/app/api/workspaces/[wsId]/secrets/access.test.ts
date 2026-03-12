import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock, createClientMock, getPermissionsMock } =
  vi.hoisted(() => ({
    createAdminClientMock: vi.fn(),
    createClientMock: vi.fn(),
    getPermissionsMock: vi.fn(),
  }));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
  createClient: createClientMock,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: getPermissionsMock,
}));

import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getWorkspaceSecretsAccess } from './access';

function createPermissionsResult(permissions: string[] = []) {
  return {
    permissions,
    containsPermission: (permission: string) =>
      permissions.includes(permission),
    withoutPermission: (permission: string) =>
      !permissions.includes(permission),
  };
}

describe('getWorkspaceSecretsAccess', () => {
  const user = { id: 'user-1' };
  const regularDb = {
    auth: {
      getUser: vi.fn(),
    },
  };
  const adminDb = { kind: 'admin-db' };

  beforeEach(() => {
    vi.clearAllMocks();
    regularDb.auth.getUser.mockResolvedValue({ data: { user } });
    createClientMock.mockResolvedValue(regularDb);
    createAdminClientMock.mockResolvedValue(adminDb);
  });

  it('returns 401 for unauthenticated users', async () => {
    regularDb.auth.getUser.mockResolvedValue({ data: { user: null } });

    const result = await getWorkspaceSecretsAccess('workspace-1');

    expect(result).toEqual({
      allowed: false,
      message: 'User not authenticated',
      status: 401,
    });
    expect(getPermissionsMock).not.toHaveBeenCalled();
  });

  it('allows workspace secret managers without using the admin client', async () => {
    getPermissionsMock
      .mockResolvedValueOnce(
        createPermissionsResult(['manage_workspace_secrets'])
      )
      .mockResolvedValueOnce(createPermissionsResult());

    const result = await getWorkspaceSecretsAccess('workspace-1');

    expect(result.allowed).toBe(true);
    if (!result.allowed) {
      throw new Error('Expected access to be granted');
    }
    expect(result.db).toBe(regularDb);
    expect(result.resolvedWsId).toBe('workspace-1');
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(getPermissionsMock).toHaveBeenNthCalledWith(1, {
      wsId: 'workspace-1',
    });
    expect(getPermissionsMock).toHaveBeenNthCalledWith(2, {
      wsId: ROOT_WORKSPACE_ID,
    });
  });

  it('allows root workspace admins with manage_workspace_roles via the admin client', async () => {
    getPermissionsMock
      .mockResolvedValueOnce(createPermissionsResult())
      .mockResolvedValueOnce(
        createPermissionsResult(['manage_workspace_roles'])
      );

    const result = await getWorkspaceSecretsAccess('workspace-2');

    expect(result.allowed).toBe(true);
    if (!result.allowed) {
      throw new Error('Expected access to be granted');
    }
    expect(result.db).toBe(adminDb);
    expect(result.resolvedWsId).toBe('workspace-2');
    expect(createAdminClientMock).toHaveBeenCalledOnce();
  });

  it('returns 403 when the user has neither workspace nor platform permissions', async () => {
    getPermissionsMock
      .mockResolvedValueOnce(createPermissionsResult())
      .mockResolvedValueOnce(createPermissionsResult());

    const result = await getWorkspaceSecretsAccess('workspace-3');

    expect(result).toEqual({
      allowed: false,
      message: 'Permission denied',
      status: 403,
    });
  });
});
