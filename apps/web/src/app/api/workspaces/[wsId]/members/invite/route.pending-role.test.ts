import { beforeEach, describe, expect, it, vi } from 'vitest';

const ROLE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const mocks = vi.hoisted(() => ({
  resolveWorkspaceRouteAccess: vi.fn(),
  updates: [] as Array<{
    filters: Record<string, string>;
    table: string;
    value: unknown;
  }>,
}));

function resultFor(
  table: string,
  mode: 'list' | 'single',
  filters: Record<string, string>
) {
  if (table === 'workspace_invites') {
    return mode === 'single'
      ? { data: { type: 'MEMBER' }, error: null }
      : {
          data: [{ role_id: ROLE_ID, user_id: USER_ID }],
          error: null,
        };
  }
  if (table === 'workspace_email_invites') {
    return mode === 'single'
      ? { data: { type: 'MEMBER' }, error: null }
      : {
          data: [{ email: 'pending@example.com', role_id: ROLE_ID }],
          error: null,
        };
  }
  if (table === 'workspace_roles') {
    return mode === 'single'
      ? { data: filters.id === ROLE_ID ? { id: ROLE_ID } : null, error: null }
      : { data: [{ id: ROLE_ID, name: 'Editor' }], error: null };
  }
  throw new Error(`Unexpected table: ${table}`);
}

function createQuery(table: string) {
  const filters: Record<string, string> = {};
  let updateValue: unknown;
  const query = {
    eq: (column: string, value: string) => {
      filters[column] = value;
      return query;
    },
    in: () => query,
    maybeSingle: async () => resultFor(table, 'single', filters),
    select: () => query,
    update: (value: unknown) => {
      updateValue = value;
      return query;
    },
  };

  Object.defineProperty(query, 'then', {
    value: (resolve: (value: unknown) => unknown) => {
      if (updateValue !== undefined) {
        mocks.updates.push({
          filters: { ...filters },
          table,
          value: updateValue,
        });
        return Promise.resolve(resolve({ error: null }));
      }
      return Promise.resolve(resolve(resultFor(table, 'list', filters)));
    },
  });

  return query;
}

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({ from: createQuery })),
}));

vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: (...args: unknown[]) =>
    mocks.resolveWorkspaceRouteAccess(...args),
}));

describe('pending workspace invitation roles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updates.length = 0;
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: true,
      permissions: {
        membershipType: 'MEMBER',
        withoutPermission: vi.fn(() => false),
        wsId: 'workspace-1',
      },
    });
  });

  it('lists assigned roles for email and registered-user invitations', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/workspaces/workspace-1/members/invite'),
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        email: null,
        role: { id: ROLE_ID, name: 'Editor' },
        userId: USER_ID,
      },
      {
        email: 'pending@example.com',
        role: { id: ROLE_ID, name: 'Editor' },
        userId: null,
      },
    ]);
  });

  it('updates the assigned role for a pending email invitation', async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(
      new Request(
        'http://localhost/api/workspaces/workspace-1/members/invite',
        {
          body: JSON.stringify({
            email: 'Pending@Example.com',
            roleId: ROLE_ID,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PATCH',
        }
      ),
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.updates).toContainEqual({
      filters: { email: 'pending@example.com', ws_id: 'workspace-1' },
      table: 'workspace_email_invites',
      value: { role_id: ROLE_ID },
    });
  });
});
