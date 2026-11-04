import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { getWorkspaceMembers } from './workspace-members';

const state = { permissionWsId: 'foreign' };
const PERMISSION_FILTER = 'workspace_roles.workspace_role_permissions.ws_id';

function createClient() {
  return {
    from: (table: string) => {
      const filters = new Map<string, unknown>();
      const result = () => {
        const allowed =
          !filters.has(PERMISSION_FILTER) ||
          filters.get(PERMISSION_FILTER) === state.permissionWsId;
        const role = {
          id: 'role',
          name: 'Role',
          workspace_role_permissions: allowed
            ? [{ enabled: true, permission: 'manage_workspace_roles' }]
            : [],
        };
        if (table === 'workspaces') {
          return { data: { creator_id: 'creator' }, error: null };
        }
        if (table === 'workspace_members_and_invites') {
          return {
            data: [{ id: 'actor', pending: false, type: 'MEMBER' }],
            error: null,
          };
        }
        if (table === 'workspace_role_members') {
          return {
            data: [{ user_id: 'actor', workspace_roles: role }],
            error: null,
          };
        }
        return { data: [], error: null };
      };
      const query = {
        eq: (key: string, value: unknown) => {
          filters.set(key, value);
          return query;
        },
        in: () => query,
        order: () => query,
        select: () => query,
        single: async () => result(),
      };
      Object.defineProperty(query, 'then', {
        value: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve),
      });
      return query;
    },
  } as unknown as TypedSupabaseClient;
}

async function loadRoles() {
  const db = createClient();
  const members = await getWorkspaceMembers({
    sbAdmin: db,
    status: 'joined',
    supabase: db,
    wsId: 'own',
  });
  return members[0]?.roles[0]?.permissions;
}

describe('tasks workspace member role permission scoping', () => {
  beforeEach(() => {
    state.permissionWsId = 'foreign';
  });

  it('does not attach another workspace permission to member roles', async () => {
    expect(await loadRoles()).toEqual([]);
  });

  it('keeps member role permissions from the requested workspace', async () => {
    state.permissionWsId = 'own';
    expect(await loadRoles()).toEqual([
      { enabled: true, permission: 'manage_workspace_roles' },
    ]);
  });
});
