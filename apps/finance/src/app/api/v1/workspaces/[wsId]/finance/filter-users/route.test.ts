import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  eq: vi.fn(),
  from: vi.fn(),
  getFinanceRouteContext: vi.fn(),
  order: vi.fn(),
  resolveFinanceRouteAuthContext: vi.fn(),
  select: vi.fn(),
  userFrom: vi.fn(),
}));

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: (...args: unknown[]) =>
    mocks.getFinanceRouteContext(...args),
}));

vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: (...args: unknown[]) =>
    mocks.resolveFinanceRouteAuthContext(...args),
}));

const profile = {
  avatar_url: 'https://example.com/a.png',
  display_name: 'Ada',
  email: 'ada@example.com',
  full_name: 'Ada Lovelace',
  id: 'user-1',
};

function withPermissions(granted: string[]) {
  mocks.getFinanceRouteContext.mockResolvedValue({
    context: {
      normalizedWsId: 'ws-1',
      permissions: {
        containsPermission: (permission: string) =>
          granted.includes(permission),
        withoutPermission: (permission: string) =>
          !granted.includes(permission),
      },
      sbAdmin: { from: mocks.from },
      supabase: { from: mocks.userFrom },
    },
  });
}

async function getUsers() {
  const { GET } = await import('./route');
  return GET(
    new Request('http://localhost/api/v1/workspaces/ws-1/finance/filter-users'),
    { params: Promise.resolve({ wsId: 'ws-1' }) }
  );
}

describe('finance filter users route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveFinanceRouteAuthContext.mockResolvedValue({});
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.order.mockResolvedValue({ data: [profile], error: null });
  });

  it('reads workspace profiles with the admin client scoped to the workspace', async () => {
    withPermissions([
      'view_transactions',
      'view_users_public_info',
      'view_users_private_info',
    ]);

    const response = await getUsers();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ users: [profile] });
    expect(mocks.from).toHaveBeenCalledWith('workspace_users');
    expect(mocks.eq).toHaveBeenCalledWith('ws_id', 'ws-1');
    expect(mocks.userFrom).not.toHaveBeenCalled();
  });

  it('omits private fields without view_users_private_info', async () => {
    withPermissions(['view_transactions', 'view_users_public_info']);

    const response = await getUsers();

    await expect(response.json()).resolves.toEqual({
      users: [
        {
          avatar_url: profile.avatar_url,
          display_name: profile.display_name,
          full_name: profile.full_name,
          id: profile.id,
        },
      ],
    });
  });

  it('returns no profiles without a view_users permission', async () => {
    withPermissions(['view_transactions']);

    const response = await getUsers();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ users: [] });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects callers without view_transactions', async () => {
    withPermissions(['view_users_public_info', 'view_users_private_info']);

    const response = await getUsers();

    expect(response.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
