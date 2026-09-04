import { beforeEach, describe, expect, it, vi } from 'vitest';

const ROLE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REVIEWER_ROLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const mocks = vi.hoisted(() => ({
  resolveWorkspaceRouteAccess: vi.fn(),
  rpcCalls: [] as Array<{ args: unknown; functionName: string }>,
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
          data: [],
          error: null,
        };
  }
  if (table === 'workspace_email_invites') {
    return mode === 'single'
      ? { data: { type: 'MEMBER' }, error: null }
      : {
          data: [],
          error: null,
        };
  }
  if (table === 'workspace_roles') {
    return mode === 'single'
      ? { data: filters.id === ROLE_ID ? { id: ROLE_ID } : null, error: null }
      : {
          data: [
            { id: ROLE_ID, name: 'Editor' },
            { id: REVIEWER_ROLE_ID, name: 'Reviewer' },
          ],
          error: null,
        };
  }
  throw new Error(`Unexpected table: ${table}`);
}

function createQuery(table: string) {
  const filters: Record<string, string> = {};
  const query = {
    eq: (column: string, value: string) => {
      filters[column] = value;
      return query;
    },
    in: () => query,
    maybeSingle: async () => resultFor(table, 'single', filters),
    select: () => query,
  };

  Object.defineProperty(query, 'then', {
    value: (resolve: (value: unknown) => unknown) => {
      return Promise.resolve(resolve(resultFor(table, 'list', filters)));
    },
  });

  return query;
}

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    from: createQuery,
    schema: () => ({
      rpc: async (functionName: string, args: unknown) => {
        mocks.rpcCalls.push({ args, functionName });
        if (functionName === 'list_workspace_invitation_role_ids') {
          return {
            data: [
              {
                email: null,
                role_ids: [ROLE_ID],
                user_id: USER_ID,
              },
              {
                email: 'pending@example.com',
                role_ids: [ROLE_ID, REVIEWER_ROLE_ID],
                user_id: null,
              },
            ],
            error: null,
          };
        }
        return { data: null, error: null };
      },
    }),
  })),
}));

vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: (...args: unknown[]) =>
    mocks.resolveWorkspaceRouteAccess(...args),
}));

describe('pending workspace invitation roles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpcCalls.length = 0;
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
        roles: [{ id: ROLE_ID, name: 'Editor' }],
        userId: USER_ID,
      },
      {
        email: 'pending@example.com',
        roles: [
          { id: ROLE_ID, name: 'Editor' },
          { id: REVIEWER_ROLE_ID, name: 'Reviewer' },
        ],
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
            roleIds: [ROLE_ID, REVIEWER_ROLE_ID],
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PATCH',
        }
      ),
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.rpcCalls).toContainEqual({
      args: {
        p_email: 'pending@example.com',
        p_role_ids: [ROLE_ID, REVIEWER_ROLE_ID],
        p_user_id: null,
        p_ws_id: 'workspace-1',
      },
      functionName: 'set_workspace_invitation_roles',
    });
  });
});
