import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
  resolveWorkspaceRouteAccess: vi.fn(),
  permissionError: null as unknown,
  roleLookup: { data: null as unknown, error: null as unknown },
  workspaceLookup: { data: null as unknown, error: null as unknown },
}));

vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: mocks.resolveWorkspaceRouteAccess,
}));

function createQuery(table: string) {
  const result = () =>
    table === 'workspace_roles'
      ? mocks.roleLookup
      : table === 'workspaces'
        ? mocks.workspaceLookup
        : { data: null, error: mocks.permissionError };
  const query: Record<string, unknown> = {};
  for (const op of ['select', 'update', 'upsert', 'delete', 'eq']) {
    query[op] = vi.fn((...args: unknown[]) => {
      mocks.calls.push({ table, op, args });
      return query;
    });
  }
  query.maybeSingle = vi.fn(async () => result());
  query.single = vi.fn(async () => result());
  // biome-ignore lint/suspicious/noThenProperty: mimics the awaitable query builder.
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve);
  return query;
}

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    from: vi.fn((table: string) => createQuery(table)),
  })),
}));

import { PUT } from './route';

function putRole(
  roleId: string,
  permissions: Array<{ enabled: boolean; id: string }> = [
    { enabled: true, id: 'admin' },
  ]
) {
  return PUT(
    new Request('http://localhost/roles', {
      body: JSON.stringify({
        name: 'Role',
        permissions,
      }),
      method: 'PUT',
    }),
    { params: Promise.resolve({ roleId, wsId: 'personal' }) }
  );
}

describe('workspace role update route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.permissionError = null;
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: true,
      permissions: { wsId: 'caller-workspace-id' },
      user: { id: 'admin-user' },
    });
    mocks.roleLookup = { data: { id: 'own-role-id' }, error: null };
    mocks.workspaceLookup = { data: { creator_id: 'owner-user' }, error: null };
  });

  it('does not write permissions for a role outside the workspace', async () => {
    mocks.roleLookup = { data: null, error: null };

    const response = await putRole('foreign-role-id');

    expect(response.status).toBe(404);
    expect(
      mocks.calls.some(
        (call) =>
          call.table === 'workspace_role_permissions' &&
          (call.op === 'upsert' || call.op === 'update')
      )
    ).toBe(false);
  });

  it('leaves the role name unchanged when the permission save fails', async () => {
    mocks.permissionError = { code: '42501', message: 'Grant rejected' };

    const response = await putRole('own-role-id');

    expect(response.status).toBe(500);
    expect(mocks.calls.some((call) => call.op === 'upsert')).toBe(true);
    expect(
      mocks.calls.some(
        (call) => call.table === 'workspace_roles' && call.op === 'update'
      )
    ).toBe(false);
  });

  it('updates permissions for a role in the resolved workspace', async () => {
    const response = await putRole('own-role-id');

    expect(response.status).toBe(200);
    expect(mocks.calls).toContainEqual({
      args: ['ws_id', 'caller-workspace-id'],
      op: 'eq',
      table: 'workspace_roles',
    });
    expect(mocks.calls).toContainEqual({
      args: [
        [
          {
            enabled: true,
            permission: 'admin',
            role_id: 'own-role-id',
            ws_id: 'caller-workspace-id',
          },
        ],
      ],
      op: 'upsert',
      table: 'workspace_role_permissions',
    });
  });

  it('drops manage_subscription from a non-creator admin payload', async () => {
    const response = await putRole('own-role-id', [
      { enabled: true, id: 'manage_subscription' },
      { enabled: true, id: 'manage_workspace_members' },
    ]);

    expect(response.status).toBe(200);
    expect(mocks.calls).toContainEqual({
      args: [
        [
          {
            enabled: true,
            permission: 'manage_workspace_members',
            role_id: 'own-role-id',
            ws_id: 'caller-workspace-id',
          },
        ],
      ],
      op: 'upsert',
      table: 'workspace_role_permissions',
    });
  });

  it('keeps manage_subscription when the workspace creator saves', async () => {
    mocks.workspaceLookup = { data: { creator_id: 'admin-user' }, error: null };

    const response = await putRole('own-role-id', [
      { enabled: true, id: 'manage_subscription' },
    ]);

    expect(response.status).toBe(200);
    expect(mocks.calls).toContainEqual({
      args: [
        [
          {
            enabled: true,
            permission: 'manage_subscription',
            role_id: 'own-role-id',
            ws_id: 'caller-workspace-id',
          },
        ],
      ],
      op: 'upsert',
      table: 'workspace_role_permissions',
    });
  });

  it('strips manage_mastermind even when the workspace creator saves', async () => {
    mocks.workspaceLookup = { data: { creator_id: 'admin-user' }, error: null };

    const response = await putRole('own-role-id', [
      { enabled: true, id: 'manage_mastermind' },
      { enabled: false, id: 'manage_mastermind' },
      { enabled: true, id: 'manage_workspace_members' },
    ]);

    expect(response.status).toBe(200);
    expect(mocks.calls).toContainEqual({
      args: [
        [
          {
            enabled: true,
            permission: 'manage_workspace_members',
            role_id: 'own-role-id',
            ws_id: 'caller-workspace-id',
          },
        ],
      ],
      op: 'upsert',
      table: 'workspace_role_permissions',
    });
    expect(JSON.stringify(mocks.calls)).not.toContain('manage_mastermind');
  });
});
