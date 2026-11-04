import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  permissions: new Set<string>(),
}));
const query = Object.assign(Promise.resolve({ data: [], error: null }), {
  select: vi.fn(),
  eq: vi.fn(),
});
vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: async () => ({
    context: {
      normalizedWsId: 'workspace',
      permissions: {
        containsPermission: (p: string) => mocks.permissions.has(p),
        withoutPermission: (p: string) => !mocks.permissions.has(p),
      },
      sbAdmin: { from: mocks.from, schema: () => ({ from: mocks.from }) },
    },
  }),
}));
vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: async () => ({ user: { id: 'member' } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions.clear();
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
});
it('SR-244 denies a plain member before reading user financial or group data', async () => {
  const { GET } = await import('./user-referral-discounts');
  const response = await GET(
    new Request('http://localhost/api/workspace/users/user'),
    { params: Promise.resolve({ wsId: 'workspace', userId: 'user' }) }
  );
  expect(response.status).toBe(403);
  expect(mocks.from).not.toHaveBeenCalled();
});

it('retains invoice creation access to the user data needed by the form', async () => {
  mocks.permissions.add('create_invoices');
  const { GET } = await import('./user-referral-discounts');
  const response = await GET(new Request('http://localhost/api/users/user'), {
    params: Promise.resolve({ wsId: 'workspace', userId: 'user' }),
  });
  expect(response.status).toBe(200);
  expect(mocks.from).toHaveBeenCalledOnce();
});
