import { describe, expect, it } from 'vitest';
import {
  canAddCreatorGrantRoleMember,
  canManageCreatorGrantRole,
  roleHasCreatorGrantPermission,
} from './workspace-creator-grant-permissions';

function supabaseFixture({
  permissions = [],
  roles = [{ id: 'role-1', ws_id: 'workspace-b' }],
  creators = { 'workspace-b': 'creator-b' },
}: {
  permissions?: Array<{ enabled?: boolean; role_id: string; ws_id: string }>;
  roles?: Array<{ id: string; ws_id: string }>;
  creators?: Record<string, string>;
} = {}) {
  return {
    from(table: string) {
      const query: Record<string, unknown> = {};
      let workspaceId: null | string = null;
      let workspaceIds: string[] = [];
      let enabledOnly = false;
      query.select = () => query;
      query.eq = (column: string, value: boolean | string) => {
        if (table === 'workspaces' && column === 'id')
          workspaceId = String(value);
        if (table === 'workspace_role_permissions' && column === 'enabled')
          enabledOnly = value === true || value === 'true';
        return query;
      };
      query.in = (column: string, values: string[]) => {
        if (table === 'workspaces' && column === 'id') workspaceIds = values;
        return query;
      };
      query.maybeSingle = async () => ({
        data:
          table === 'workspaces'
            ? { creator_id: creators[workspaceId ?? ''] }
            : null,
        error: null,
      });
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable.
      query.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data:
            table === 'workspace_roles'
              ? roles
              : table === 'workspace_role_permissions'
                ? permissions.filter(
                    (permission) => !enabledOnly || permission.enabled !== false
                  )
                : table === 'workspaces'
                  ? workspaceIds.map((id) => ({ id, creator_id: creators[id] }))
                  : [],
          error: null,
        }).then(resolve);
      return query;
    },
  } as never;
}

describe('creator-granted role membership checks', () => {
  it('fails closed when the role belongs to a different workspace', async () => {
    const supabase = supabaseFixture({
      roles: [{ id: 'role-1', ws_id: 'workspace-a' }],
      permissions: [{ role_id: 'role-1', ws_id: 'workspace-b' }],
    });

    await expect(
      roleHasCreatorGrantPermission(supabase, {
        roleId: 'role-1',
        wsId: 'workspace-b',
      })
    ).resolves.toBe(true);
    await expect(
      canManageCreatorGrantRole(supabase, {
        roleId: 'role-1',
        userId: 'creator-b',
        wsId: 'workspace-b',
      })
    ).resolves.toBe(false);
  });

  it('requires creator ownership of every workspace holding the role grant', async () => {
    const supabase = supabaseFixture({
      permissions: [
        { role_id: 'role-1', ws_id: 'workspace-b' },
        { role_id: 'role-1', ws_id: 'workspace-c' },
      ],
      creators: {
        'workspace-b': 'creator-b',
        'workspace-c': 'creator-c',
      },
    });

    await expect(
      canManageCreatorGrantRole(supabase, {
        roleId: 'role-1',
        userId: 'creator-b',
        wsId: 'workspace-b',
      })
    ).resolves.toBe(false);
  });

  it('treats a disabled creator-grant row as a protected role grant', async () => {
    const supabase = supabaseFixture({
      permissions: [
        { enabled: false, role_id: 'role-1', ws_id: 'workspace-b' },
      ],
    });

    await expect(
      canManageCreatorGrantRole(supabase, {
        roleId: 'role-1',
        userId: 'admin-1',
        wsId: 'workspace-b',
      })
    ).resolves.toBe(false);
  });

  it('keeps disabled rows out of enabled role-member checks', async () => {
    const supabase = supabaseFixture({
      permissions: [
        { enabled: false, role_id: 'role-1', ws_id: 'workspace-b' },
      ],
    });

    await expect(
      roleHasCreatorGrantPermission(supabase, {
        roleId: 'role-1',
        wsId: 'workspace-b',
      })
    ).resolves.toBe(false);
    await expect(
      canAddCreatorGrantRoleMember(supabase, {
        roleId: 'role-1',
        userId: 'admin-1',
        wsId: 'workspace-b',
      })
    ).resolves.toBe(true);
  });

  it('reports a disabled creator-grant row when disabled rows are included', async () => {
    const supabase = supabaseFixture({
      permissions: [
        { enabled: false, role_id: 'role-1', ws_id: 'workspace-b' },
      ],
    });

    await expect(
      roleHasCreatorGrantPermission(supabase, {
        includeDisabled: true,
        roleId: 'role-1',
        wsId: 'workspace-b',
      })
    ).resolves.toBe(true);
  });
});
