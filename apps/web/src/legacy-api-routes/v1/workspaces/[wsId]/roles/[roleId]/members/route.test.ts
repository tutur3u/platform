import { beforeEach, describe, expect, it, vi } from 'vitest';

const MEMBER_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
  creatorId: 'owner-user',
  resolveWorkspaceRouteAccess: vi.fn(),
  rolePermissions: [] as Array<{
    permission: string;
    role_id: string;
    ws_id: string;
  }>,
  roleWorkspaceId: 'workspace-id',
}));

vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: mocks.resolveWorkspaceRouteAccess,
}));

function createQuery(table: string) {
  const single = () => {
    if (table === 'workspace_roles') {
      return {
        data: { id: 'role-id', ws_id: mocks.roleWorkspaceId },
        error: null,
      };
    }
    if (table === 'workspaces') {
      return { data: { creator_id: mocks.creatorId }, error: null };
    }
    return { data: null, error: null };
  };
  const query: Record<string, unknown> = {};
  for (const op of ['select', 'eq', 'in', 'insert']) {
    query[op] = vi.fn((...args: unknown[]) => {
      mocks.calls.push({ table, op, args });
      return query;
    });
  }
  query.maybeSingle = vi.fn(async () => single());
  // biome-ignore lint/suspicious/noThenProperty: mimics the awaitable query builder.
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(
      table === 'workspace_role_permissions'
        ? { data: mocks.rolePermissions, error: null }
        : table === 'workspace_members'
          ? { data: [{ user_id: MEMBER_ID }], error: null }
          : table === 'workspace_roles'
            ? {
                data: [{ id: 'role-id', ws_id: mocks.roleWorkspaceId }],
                error: null,
              }
            : { data: null, error: null }
    ).then(resolve);
  return query;
}

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    from: vi.fn((table: string) => createQuery(table)),
  })),
}));

import { POST } from './route';

function addMembers() {
  return POST(
    new Request('http://localhost/roles/role-id/members', {
      body: JSON.stringify({ memberIds: [MEMBER_ID] }),
      method: 'POST',
    }),
    { params: Promise.resolve({ roleId: 'role-id', wsId: 'workspace-id' }) }
  );
}

const memberInserted = () =>
  mocks.calls.some(
    (call) => call.table === 'workspace_role_members' && call.op === 'insert'
  );

describe('workspace role members route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.creatorId = 'owner-user';
    mocks.rolePermissions = [];
    mocks.roleWorkspaceId = 'workspace-id';
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: true,
      permissions: { wsId: 'workspace-id' },
      user: { id: 'admin-user' },
    });
  });

  it('adds members to an ordinary role', async () => {
    const response = await addMembers();

    expect(response.status).toBe(200);
    expect(memberInserted()).toBe(true);
  });

  it('rejects a non-creator adding members to a manage_subscription role', async () => {
    mocks.rolePermissions = [
      {
        permission: 'manage_subscription',
        role_id: 'role-id',
        ws_id: 'workspace-id',
      },
    ];

    const response = await addMembers();

    expect(response.status).toBe(403);
    expect(memberInserted()).toBe(false);
  });

  it('lets the workspace creator add members to a manage_subscription role', async () => {
    mocks.rolePermissions = [
      {
        permission: 'manage_subscription',
        role_id: 'role-id',
        ws_id: 'workspace-id',
      },
    ];
    mocks.creatorId = 'admin-user';

    const response = await addMembers();

    expect(response.status).toBe(200);
    expect(memberInserted()).toBe(true);
  });

  it('rejects a role whose own workspace differs from the route workspace', async () => {
    mocks.roleWorkspaceId = 'workspace-a';
    mocks.rolePermissions = [
      {
        permission: 'manage_subscription',
        role_id: 'role-id',
        ws_id: 'workspace-a',
      },
    ];

    const response = await addMembers();

    expect(response.status).toBe(404);
    expect(memberInserted()).toBe(false);
  });
});
