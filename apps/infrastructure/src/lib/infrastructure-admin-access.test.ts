import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  getSatelliteAppSessionUser: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.getSatelliteAppSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));

describe('Infrastructure admin access', () => {
  const user = { email: 'admin@tuturuuu.com', id: 'user-1' };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSatelliteAppSessionUser.mockResolvedValue(user);
    mocks.createAdminClient.mockResolvedValue({ from: vi.fn() });
  });

  it('rejects a root member without the requested infrastructure permission', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn().mockReturnValue(false),
    });
    const { authorizeInfrastructureAdminRequest } = await import(
      './infrastructure-admin-access'
    );

    const result = await authorizeInfrastructureAdminRequest(
      'manage_workspace_roles'
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user,
      wsId: ROOT_WORKSPACE_ID,
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('preserves access for root users with the requested permission', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn(
        (permission: string) => permission === 'manage_workspace_roles'
      ),
    });
    const { authorizeInfrastructureAdminRequest } = await import(
      './infrastructure-admin-access'
    );

    const result = await authorizeInfrastructureAdminRequest(
      'manage_workspace_roles'
    );

    expect(result.ok).toBe(true);
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
  });

  it('allows workspace secret managers only for their workspace', async () => {
    const targetPermissions = {
      containsPermission: vi.fn(
        (permission: string) => permission === 'manage_workspace_secrets'
      ),
    };
    const rootPermissions = {
      containsPermission: vi.fn().mockReturnValue(false),
    };
    mocks.getPermissions.mockResolvedValueOnce(targetPermissions);
    mocks.getPermissions.mockResolvedValueOnce(rootPermissions);
    const { authorizeInfrastructureWorkspaceSecretsRequest } = await import(
      './infrastructure-admin-access'
    );

    const result =
      await authorizeInfrastructureWorkspaceSecretsRequest('tenant-workspace');

    expect(result.ok).toBe(true);
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user,
      wsId: 'tenant-workspace',
    });
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user,
      wsId: ROOT_WORKSPACE_ID,
    });
  });

  it('rejects root workspace members without secret-management permissions', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn().mockReturnValue(false),
    });
    const { authorizeInfrastructureWorkspaceSecretsRequest } = await import(
      './infrastructure-admin-access'
    );

    const result =
      await authorizeInfrastructureWorkspaceSecretsRequest('tenant-workspace');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('preserves cross-workspace access for root secret administrators', async () => {
    const targetPermissions = {
      containsPermission: vi.fn().mockReturnValue(false),
    };
    const rootPermissions = {
      containsPermission: vi.fn(
        (permission: string) => permission === 'manage_workspace_secrets'
      ),
    };
    mocks.getPermissions.mockResolvedValueOnce(targetPermissions);
    mocks.getPermissions.mockResolvedValueOnce(rootPermissions);
    const { authorizeInfrastructureWorkspaceSecretsRequest } = await import(
      './infrastructure-admin-access'
    );

    const result =
      await authorizeInfrastructureWorkspaceSecretsRequest('tenant-workspace');

    expect(result.ok).toBe(true);
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
  });
});
