import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUT as putDefaults } from './default/route';
import { PUT as putRole } from './[roleId]/route';

const mocks = vi.hoisted(() => ({
  hasRootExternalProjectsAdminPermission: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  requireWorkspaceExternalProjectMemberBootstrapAccess: vi.fn(),
}));

vi.mock('@/lib/external-projects/access', () => mocks);

vi.mock('@tuturuuu/payment-core/seat-limits', () => ({
  getEffectiveAvailableSeats: vi.fn(),
}));

const rpc = vi.fn();
const schema = vi.fn(() => ({ rpc }));
const tableWrites: string[] = [];

function from(table: string) {
  const query: Record<string, unknown> = {
    eq: () => query,
    single: async () => ({
      data: { id: 'role-1', name: 'Publisher' },
      error: null,
    }),
  };
  query.select = () => query;
  for (const op of ['insert', 'update', 'upsert', 'delete']) {
    query[op] = () => {
      tableWrites.push(`${op}:${table}`);
      return query;
    };
  }
  return query;
}

function grantAccess(permissions: string[]) {
  mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
    admin: { from, rpc: vi.fn(), schema },
    normalizedWorkspaceId: 'resolved-ws',
    ok: true,
    rootPermissions: null,
    user: { email: 'editor@example.com', id: 'server-actor' },
    workspacePermissions: {
      containsPermission: (permission: string) =>
        permissions.includes(permission),
    },
  });
}

const permissions = [{ enabled: true, id: 'manage_workspace_roles' }];

function roleRequest() {
  return putRole(
    new Request('http://localhost/roles/role-1', {
      body: JSON.stringify({ name: 'Publisher', permissions }),
      method: 'PUT',
    }),
    { params: Promise.resolve({ roleId: 'role-1', wsId: 'personal' }) }
  );
}

function defaultsRequest() {
  return putDefaults(
    new Request('http://localhost/roles/default?memberType=MEMBER', {
      body: JSON.stringify({ permissions }),
      method: 'PUT',
    }),
    { params: Promise.resolve({ wsId: 'personal' }) }
  );
}

describe('CMS access-level edit routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableWrites.length = 0;
    mocks.hasRootExternalProjectsAdminPermission.mockReturnValue(false);
    rpc.mockResolvedValue({ data: 'updated', error: null });
  });

  it.each([
    ['role', roleRequest],
    ['default access', defaultsRequest],
  ])(
    'rejects a non-manager %s edit before the guarded function',
    async (_label, send) => {
      grantAccess(['manage_workspace_members']);
      const response = await send();

      expect(response.status).toBe(403);
      expect(schema).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      expect(tableWrites).toEqual([]);
    }
  );

  it('updates a role through the guarded function for a manager', async () => {
    grantAccess(['manage_workspace_roles']);
    const response = await roleRequest();

    expect(response.status).toBe(200);
    expect(schema).toHaveBeenCalledExactlyOnceWith('private');
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      'update_workspace_role_guarded',
      {
        p_actor_id: 'server-actor',
        p_mode: 'cms',
        p_name: 'Publisher',
        p_permissions: permissions,
        p_role_id: 'role-1',
        p_ws_id: 'resolved-ws',
      }
    );
    expect(tableWrites).toEqual([]);
  });

  it('updates default access through the guarded function for a manager', async () => {
    grantAccess(['manage_workspace_roles']);
    const response = await defaultsRequest();

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      'update_workspace_default_permissions_guarded',
      {
        p_actor_id: 'server-actor',
        p_member_type: 'MEMBER',
        p_mode: 'cms',
        p_permissions: permissions,
        p_ws_id: 'resolved-ws',
      }
    );
    expect(tableWrites).toEqual([]);
  });

  it.each([
    ['role', roleRequest],
    ['default access', defaultsRequest],
  ])(
    'answers 409 when the %s edit removes the last manager',
    async (_label, send) => {
      grantAccess(['manage_workspace_roles']);
      rpc.mockResolvedValue({ data: 'last_manager', error: null });
      const response = await send();

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: 'WORKSPACE_LAST_MANAGER',
      });
    }
  );

  it.each([
    ['role', roleRequest],
    ['default access', defaultsRequest],
  ])(
    'answers 403 when the guarded function forbids the %s edit',
    async (_label, send) => {
      grantAccess(['manage_workspace_roles']);
      rpc.mockResolvedValue({ data: 'forbidden', error: null });
      const response = await send();

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Forbidden' });
    }
  );
});
