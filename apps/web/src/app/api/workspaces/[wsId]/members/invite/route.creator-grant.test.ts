import { beforeEach, describe, expect, it, vi } from 'vitest';

const BILLING_ROLE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STAFF_ROLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CREATOR_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ADMIN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const mocks = vi.hoisted(() => ({
  actorId: '',
  pendingRoleIds: [] as string[],
  resolveWorkspaceRouteAccess: vi.fn(),
  rpcCalls: [] as Array<{ args: unknown; functionName: string }>,
}));

function resultFor(table: string, filters: Record<string, unknown>) {
  if (table === 'workspaces') {
    return { data: { creator_id: CREATOR_ID, personal: false }, error: null };
  }
  if (table === 'workspace_secrets') return { data: null, error: null };
  if (table === 'workspace_email_invites') {
    return { data: { type: 'MEMBER' }, error: null };
  }
  if (table === 'workspace_roles') {
    const ids = (filters.id as string[]) ?? [];
    return { data: ids.map((id) => ({ id })), error: null };
  }
  if (table === 'workspace_role_permissions') {
    const ids = (filters.role_id as string[]) ?? [];
    return {
      data: ids
        .filter((id) => id === BILLING_ROLE_ID)
        .map((role_id) => ({ role_id })),
      error: null,
    };
  }
  throw new Error(`Unexpected table: ${table}`);
}

function createQuery(table: string) {
  const filters: Record<string, unknown> = {};
  const query: Record<string, unknown> = {
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return query;
    },
    in: (column: string, values: unknown[]) => {
      filters[column] = values;
      return query;
    },
    maybeSingle: async () => resultFor(table, filters),
    select: () => query,
  };
  // biome-ignore lint/suspicious/noThenProperty: mimics the awaitable query builder.
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(resultFor(table, filters)).then(resolve);
  return query;
}

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    from: createQuery,
    schema: () => ({
      rpc: async (functionName: string, args: unknown) => {
        mocks.rpcCalls.push({ args, functionName });
        if (functionName === 'get_workspace_invitation_role_ids') {
          return { data: mocks.pendingRoleIds, error: null };
        }
        return { data: null, error: null };
      },
    }),
  })),
}));

vi.mock('@tuturuuu/payment-core/seat-limits', () => ({
  canCreateInvitation: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: (...args: unknown[]) =>
    mocks.resolveWorkspaceRouteAccess(...args),
}));

function request(method: 'PATCH' | 'POST', body: unknown) {
  return new Request(
    'http://localhost/api/workspaces/workspace-1/members/invite',
    {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method,
    }
  );
}

const params = { params: Promise.resolve({ wsId: 'workspace-1' }) };
const rpcNames = () => mocks.rpcCalls.map((call) => call.functionName);

describe('invitation roles holding a creator-grant permission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actorId = ADMIN_ID;
    mocks.pendingRoleIds = [];
    mocks.rpcCalls.length = 0;
    mocks.resolveWorkspaceRouteAccess.mockImplementation(async () => ({
      ok: true,
      permissions: {
        membershipType: 'MEMBER',
        withoutPermission: vi.fn(() => false),
        wsId: 'workspace-1',
      },
      user: { id: mocks.actorId },
    }));
  });

  it('rejects a non-creator inviting with a billing role', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      request('POST', {
        email: 'new@example.com',
        roleIds: [STAFF_ROLE_ID, BILLING_ROLE_ID],
      }),
      params
    );

    expect(response.status).toBe(403);
    expect(rpcNames()).not.toContain(
      'create_workspace_email_invitation_with_roles'
    );
  });

  it('lets a non-creator invite with ordinary roles', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      request('POST', { email: 'new@example.com', roleIds: [STAFF_ROLE_ID] }),
      params
    );

    expect(response.status).toBe(200);
    expect(rpcNames()).toContain(
      'create_workspace_email_invitation_with_roles'
    );
  });

  it('lets the creator invite with a billing role', async () => {
    mocks.actorId = CREATOR_ID;
    const { POST } = await import('./route');
    const response = await POST(
      request('POST', { email: 'new@example.com', roleIds: [BILLING_ROLE_ID] }),
      params
    );

    expect(response.status).toBe(200);
    expect(mocks.rpcCalls).toContainEqual({
      args: expect.objectContaining({
        p_invited_by: CREATOR_ID,
        p_role_ids: [BILLING_ROLE_ID],
      }),
      functionName: 'create_workspace_email_invitation_with_roles',
    });
  });

  it('rejects a non-creator adding a billing role to a pending invitation', async () => {
    mocks.pendingRoleIds = [STAFF_ROLE_ID];
    const { PATCH } = await import('./route');
    const response = await PATCH(
      request('PATCH', {
        email: 'pending@example.com',
        roleIds: [STAFF_ROLE_ID, BILLING_ROLE_ID],
      }),
      params
    );

    expect(response.status).toBe(403);
    expect(rpcNames()).not.toContain('set_workspace_invitation_roles');
  });

  it('lets a non-creator keep a billing role the invitation already has', async () => {
    mocks.pendingRoleIds = [BILLING_ROLE_ID];
    const { PATCH } = await import('./route');
    const response = await PATCH(
      request('PATCH', {
        email: 'pending@example.com',
        roleIds: [STAFF_ROLE_ID, BILLING_ROLE_ID],
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(mocks.rpcCalls).toContainEqual({
      args: expect.objectContaining({ p_actor_id: ADMIN_ID }),
      functionName: 'set_workspace_invitation_roles',
    });
  });

  it('lets the creator add a billing role to a pending invitation', async () => {
    mocks.actorId = CREATOR_ID;
    const { PATCH } = await import('./route');
    const response = await PATCH(
      request('PATCH', {
        email: 'pending@example.com',
        roleIds: [BILLING_ROLE_ID],
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(mocks.rpcCalls).toContainEqual({
      args: expect.objectContaining({
        p_actor_id: CREATOR_ID,
        p_role_ids: [BILLING_ROLE_ID],
      }),
      functionName: 'set_workspace_invitation_roles',
    });
  });
});
