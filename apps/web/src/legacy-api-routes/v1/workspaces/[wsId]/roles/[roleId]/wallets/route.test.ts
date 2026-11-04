import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  permissions: vi.fn(),
  privateFrom: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: mocks.from,
    schema: () => ({ from: mocks.privateFrom }),
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));
const params = {
  params: Promise.resolve({ wsId: 'personal', roleId: 'role' }),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions.mockResolvedValue({
    wsId: 'workspace',
    withoutPermission: () => false,
  });
});
it('returns 404 for a role outside the authorized workspace without reading wallet data', async () => {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  mocks.from.mockReturnValue(chain);
  const { GET } = await import('./route');
  const response = await GET(new Request('https://example.test'), params);
  expect(response.status).toBe(404);
  expect(mocks.from).not.toHaveBeenCalledWith(
    'workspace_role_wallet_whitelist'
  );
  expect(mocks.privateFrom).not.toHaveBeenCalled();
});
it('lists only local wallet details for a local role using the resolved workspace', async () => {
  const wallets = {
    select: vi.fn(),
    in: vi.fn(),
    eq: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  wallets.select.mockReturnValue(wallets);
  wallets.in.mockReturnValue(wallets);
  mocks.privateFrom.mockReturnValue(wallets);
  const role = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: { id: 'role' }, error: null }),
  };
  role.select.mockReturnValue(role);
  role.eq.mockReturnValue(role);
  const whitelist = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi
      .fn()
      .mockResolvedValue({ data: [{ wallet_id: 'wallet' }], error: null }),
  };
  whitelist.select.mockReturnValue(whitelist);
  whitelist.eq.mockReturnValue(whitelist);
  mocks.from.mockImplementation((table) =>
    table === 'workspace_roles' ? role : whitelist
  );
  const { GET } = await import('./route');
  const response = await GET(new Request('https://example.test'), params);
  expect(response.status).toBe(200);
  expect(role.eq).toHaveBeenCalledWith('ws_id', 'workspace');
  expect(wallets.eq).toHaveBeenCalledWith('ws_id', 'workspace');
});
