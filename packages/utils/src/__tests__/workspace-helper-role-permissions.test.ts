import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateAdminClient } = vi.hoisted(() => ({
  mockCreateAdminClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mockCreateAdminClient,
  createClient: vi.fn(),
}));

import { getPermissions } from '../workspace-helper';

describe('getPermissions role permission scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('only reads role permission rows scoped to the resolved workspace', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111';
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

    const workspaceQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn(),
    };
    workspaceQuery.select.mockReturnValue(workspaceQuery);
    workspaceQuery.eq.mockReturnValue(workspaceQuery);
    workspaceQuery.single.mockResolvedValue({
      data: { creator_id: 'owner-1' },
      error: null,
    });

    const roleMembersQuery = {
      select: vi.fn(),
      eq: vi.fn(),
    };
    roleMembersQuery.select.mockReturnValue(roleMembersQuery);
    roleMembersQuery.eq.mockImplementation((field) => {
      if (field === 'workspace_roles.workspace_role_permissions.enabled') {
        return Promise.resolve({
          data: [
            {
              workspace_roles: {
                workspace_role_permissions: [{ permission: 'manage_users' }],
              },
            },
          ],
          error: null,
        });
      }
      return roleMembersQuery;
    });

    const defaultPermissionsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
    };
    defaultPermissionsQuery.select.mockReturnValue(defaultPermissionsQuery);
    defaultPermissionsQuery.eq.mockImplementation((field) => {
      if (field === 'enabled') {
        return Promise.resolve({ data: [], error: null });
      }
      return defaultPermissionsQuery;
    });

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

    const permissions = await getPermissions({
      user: { id: 'user-1', email: 'member@example.com' },
      wsId: workspaceId,
    });

    expect(permissions?.containsPermission('manage_users')).toBe(true);
    expect(roleMembersQuery.eq).toHaveBeenCalledWith(
      'workspace_roles.ws_id',
      workspaceId
    );
    expect(roleMembersQuery.eq).toHaveBeenCalledWith(
      'workspace_roles.workspace_role_permissions.ws_id',
      workspaceId
    );
  });
});
