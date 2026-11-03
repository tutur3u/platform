import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkE2EEPermission } from '../legacy-api-routes/v1/workspaces/[wsId]/encryption/utils';
import { getWorkspaceMembers } from './workspace-members';

const state = vi.hoisted(() => ({ permissionWsId: 'foreign' }));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({ user: { id: 'actor' } }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: (table: string) => {
      const filters = new Map<string, unknown>();
      const result = () => {
        const allowed =
          !filters.has('workspace_roles.workspace_role_permissions.ws_id') ||
          filters.get('workspace_roles.workspace_role_permissions.ws_id') ===
            state.permissionWsId;
        const permission = { permission: 'manage_e2ee', enabled: true };
        const role = {
          id: 'role',
          name: 'Role',
          workspace_role_permissions: allowed ? [permission] : [],
        };
        if (table === 'workspaces')
          return { data: { creator_id: 'creator' }, error: null };
        if (table === 'workspace_members_and_invites')
          return {
            data: [{ id: 'actor', pending: false, type: 'MEMBER' }],
            error: null,
          };
        if (table === 'workspace_role_members')
          return {
            data: [{ user_id: 'actor', workspace_roles: role }],
            error: null,
          };
        return { data: [], error: null };
      };
      const query = {
        eq: (key: string, value: unknown) => {
          filters.set(key, value);
          return query;
        },
        in: () => query,
        order: () => query,
        limit: () => query,
        select: () => query,
        single: async () => result(),
        maybeSingle: async () => {
          if (table !== 'workspace_role_members')
            return { data: null, error: null };
          const response = result();
          const roles = Array.isArray(response.data) ? response.data : [];
          const row = roles[0];
          return {
            data:
              row &&
              'workspace_roles' in row &&
              row.workspace_roles.workspace_role_permissions.length
                ? row
                : null,
            error: null,
          };
        },
      };
      Object.defineProperty(query, 'then', {
        value: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve),
      });
      return query;
    },
  }),
}));
describe('workspace role permission reader scoping', () => {
  beforeEach(() => {
    state.permissionWsId = 'foreign';
  });
  it('does not grant E2EE from a permission row in another workspace', async () => {
    const result = await checkE2EEPermission(await createAdminClient(), 'own');
    expect(result).toMatchObject({
      authorized: false,
      reason: 'no_permission',
    });
  });
  it('does not attach another workspace permission to member roles', async () => {
    const db = await createAdminClient();
    const members = await getWorkspaceMembers({
      supabase: db,
      sbAdmin: db,
      wsId: 'own',
      status: 'joined',
    });
    expect(members[0]?.roles[0]?.permissions).toEqual([]);
  });
  it('keeps E2EE permissions from the requested workspace', async () => {
    state.permissionWsId = 'own';
    expect(
      await checkE2EEPermission(await createAdminClient(), 'own')
    ).toMatchObject({ authorized: true });
  });
  it('keeps member role permissions from the requested workspace', async () => {
    state.permissionWsId = 'own';
    const db = await createAdminClient();
    const members = await getWorkspaceMembers({
      supabase: db,
      sbAdmin: db,
      wsId: 'own',
      status: 'joined',
    });
    expect(members[0]?.roles[0]?.permissions).toEqual([
      { permission: 'manage_e2ee', enabled: true },
    ]);
  });
});
