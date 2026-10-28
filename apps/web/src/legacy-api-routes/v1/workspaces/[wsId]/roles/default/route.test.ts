import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
  resolveWorkspaceRouteAccess: vi.fn(),
  permissionError: null as unknown,
  roleLookup: { data: null as unknown, error: null as unknown },
}));

vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: mocks.resolveWorkspaceRouteAccess,
}));

function createQuery(table: string) {
  const result = () =>
    table === 'workspace_roles'
      ? mocks.roleLookup
      : { data: null, error: mocks.permissionError };
  const query: Record<string, unknown> = {};
  for (const op of ['insert', 'select', 'update', 'upsert', 'delete', 'eq']) {
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

describe('explicit grant filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.permissionError = null;
    mocks.roleLookup = { data: { id: 'role-1' }, error: null };
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: true,
      permissions: { wsId: 'resolved-workspace' },
    });
  });
  it.each([true, false])(
    'omits explicit grant %s from legacy writes',
    async (enabled) => {
      const response = await PUT(
        new Request('http://localhost/roles', {
          method: 'PUT',
          body: JSON.stringify({
            name: 'Role',
            permissions: [
              { id: 'admin', enabled: true },
              { id: 'manage_mastermind', enabled },
            ],
          }),
        }),
        { params: Promise.resolve({ wsId: 'personal' }) }
      );
      expect(response.status).toBe(200);
      const write = mocks.calls.find(
        (call) =>
          call.table === 'workspace_default_permissions' && call.op === 'upsert'
      );
      expect(write?.args[0]).toEqual([
        {
          permission: 'admin',
          enabled: true,
          ws_id: 'resolved-workspace',
          member_type: 'MEMBER',
        },
      ]);
    }
  );
});
