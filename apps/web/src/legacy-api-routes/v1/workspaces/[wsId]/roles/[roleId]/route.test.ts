import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
  resolveWorkspaceRouteAccess: vi.fn(),
  roleLookup: { data: null as unknown, error: null as unknown },
}));

vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: mocks.resolveWorkspaceRouteAccess,
}));

function createQuery(table: string) {
  const result = () =>
    table === 'workspace_roles'
      ? mocks.roleLookup
      : { data: null, error: null };
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
    Promise.resolve({ data: null, error: null }).then(resolve);
  return query;
}

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    from: vi.fn((table: string) => createQuery(table)),
  })),
}));

import { PUT } from './route';

function putRole(roleId: string) {
  return PUT(
    new Request('http://localhost/roles', {
      body: JSON.stringify({
        name: 'Role',
        permissions: [{ enabled: true, id: 'admin' }],
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
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: true,
      permissions: { wsId: 'caller-workspace-id' },
    });
    mocks.roleLookup = { data: { id: 'own-role-id' }, error: null };
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
});
