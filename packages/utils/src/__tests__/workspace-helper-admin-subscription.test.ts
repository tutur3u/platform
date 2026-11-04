import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateAdminClient } = vi.hoisted(() => ({
  mockCreateAdminClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mockCreateAdminClient,
  createClient: vi.fn(),
}));

import { getPermissions } from '../workspace-helper';

const workspaceId = '11111111-1111-4111-8111-111111111111';

function mockWorkspace({
  creatorId = 'owner-1',
  defaultPermissions = [] as string[],
  rolePermissions = [] as string[],
}) {
  const membershipQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  membershipQuery.select.mockReturnValue(membershipQuery);
  membershipQuery.eq.mockReturnValue(membershipQuery);
  membershipQuery.maybeSingle.mockResolvedValue({
    data: { type: 'MEMBER' },
    error: null,
  });

  const workspaceQuery = { select: vi.fn(), eq: vi.fn(), single: vi.fn() };
  workspaceQuery.select.mockReturnValue(workspaceQuery);
  workspaceQuery.eq.mockReturnValue(workspaceQuery);
  workspaceQuery.single.mockResolvedValue({
    data: { creator_id: creatorId },
    error: null,
  });

  const roleMembersQuery = { select: vi.fn(), eq: vi.fn() };
  roleMembersQuery.select.mockReturnValue(roleMembersQuery);
  roleMembersQuery.eq.mockImplementation((field) =>
    field === 'workspace_roles.workspace_role_permissions.enabled'
      ? Promise.resolve({
          data: [
            {
              workspace_roles: {
                workspace_role_permissions: rolePermissions.map(
                  (permission) => ({ permission })
                ),
              },
            },
          ],
          error: null,
        })
      : roleMembersQuery
  );

  const defaultPermissionsQuery = { select: vi.fn(), eq: vi.fn() };
  defaultPermissionsQuery.select.mockReturnValue(defaultPermissionsQuery);
  defaultPermissionsQuery.eq.mockImplementation((field) =>
    field === 'enabled'
      ? Promise.resolve({
          data: defaultPermissions.map((permission) => ({ permission })),
          error: null,
        })
      : defaultPermissionsQuery
  );

  mockCreateAdminClient.mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === 'workspace_members') return membershipQuery;
      if (table === 'workspaces') return workspaceQuery;
      if (table === 'workspace_role_members') return roleMembersQuery;
      if (table === 'workspace_default_permissions') {
        return defaultPermissionsQuery;
      }
      throw new Error(`Unexpected admin table lookup: ${table}`);
    }),
  });
}

function resolvePermissions(userId = 'user-1') {
  return getPermissions({
    user: { id: userId, email: 'member@example.com' },
    wsId: workspaceId,
  });
}

describe('getPermissions admin and manage_subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not let a role admin pass manage_subscription checks', async () => {
    mockWorkspace({ rolePermissions: ['admin'] });

    const permissions = await resolvePermissions();

    expect(permissions?.containsPermission('manage_workspace_roles')).toBe(
      true
    );
    expect(permissions?.containsPermission('manage_subscription')).toBe(false);
    expect(permissions?.withoutPermission('manage_subscription')).toBe(true);
  });

  it('does not let a default-permission admin pass manage_subscription checks', async () => {
    mockWorkspace({ defaultPermissions: ['admin'] });

    const permissions = await resolvePermissions();

    expect(permissions?.containsPermission('manage_subscription')).toBe(false);
  });

  it('honours an explicit manage_subscription grant alongside admin', async () => {
    mockWorkspace({ rolePermissions: ['admin', 'manage_subscription'] });

    const permissions = await resolvePermissions();

    expect(permissions?.containsPermission('manage_subscription')).toBe(true);
  });

  it('keeps manage_subscription for the workspace creator', async () => {
    mockWorkspace({ creatorId: 'user-1' });

    const permissions = await resolvePermissions('user-1');

    expect(permissions?.containsPermission('manage_subscription')).toBe(true);
  });
});
