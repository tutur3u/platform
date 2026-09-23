import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), auth: vi.fn() }));
vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: mocks.access,
}));
vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: mocks.auth,
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { GET } from './route';

function builder(responses: unknown[]) {
  let page = 0;
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of [
    'select',
    'eq',
    'gt',
    'not',
    'or',
    'order',
    'range',
    'in',
  ])
    query[method] = vi.fn(() => query);
  // biome-ignore lint/suspicious/noThenProperty: Model the Supabase thenable query builder.
  query.then = vi.fn((resolve: (value: unknown) => unknown) =>
    Promise.resolve(responses[Math.min(page++, responses.length - 1)]).then(
      resolve
    )
  );
  return query;
}
const row = (id = 'i1') => ({
  id,
  customer_id: 'u1',
  completed_at: '2026-09-01',
  paid_amount: 1200,
  wallet_id: 'w1',
  subscription_months: ['2026-01-01'],
  valid_until: '2026-02-01',
  finance_invoice_user_groups: [{ user_group_id: 'g1' }],
});
const request = (suffix = 'year=2026') =>
  GET(new Request(`http://localhost/api?${suffix}`), {
    params: Promise.resolve({ wsId: 'alias' }),
  });
function setup(
  pages = [{ data: [row()], count: 1, error: null }] as unknown[],
  wallets: unknown = { data: [{ id: 'w1', currency: 'VND' }], error: null }
) {
  const invoices = builder(pages);
  const wallet = builder([wallets]);
  const privateSchema = { from: vi.fn(() => wallet) };
  const sbAdmin = {
    from: vi.fn(() => invoices),
    schema: vi.fn(() => privateSchema),
  };
  mocks.access.mockResolvedValue({
    context: {
      normalizedWsId: 'resolved-ws',
      sbAdmin,
      permissions: { withoutPermission: () => false },
    },
  });
  return { invoices, wallet, sbAdmin };
}
describe('subscription analytics route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({});
  });
  it('scopes invoices and wallet lookup to the resolved workspace', async () => {
    const { invoices, wallet, sbAdmin } = setup();
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(invoices.eq).toHaveBeenCalledWith('ws_id', 'resolved-ws');
    expect(invoices.not).toHaveBeenCalledWith('completed_at', 'is', null);
    expect(invoices.or?.mock.calls[0]?.[0]).toContain(
      'subscription_months.ov.{2026-01-01'
    );
    expect(wallet.eq).toHaveBeenCalledWith('ws_id', 'resolved-ws');
    expect(sbAdmin.schema).toHaveBeenCalledWith('private');
    expect((await response.json()).currencies[0].periods[0].amount).toBe(1200);
  });
  it('returns authentication failures unchanged', async () => {
    mocks.access.mockResolvedValue({
      response: new Response(null, { status: 401 }),
    });
    expect((await request()).status).toBe(401);
  });
  it('requires invoice viewing permission before reading data', async () => {
    const { sbAdmin } = setup();
    mocks.access.mockResolvedValue({
      context: {
        sbAdmin,
        normalizedWsId: 'ws',
        permissions: { withoutPermission: () => true },
      },
    });
    expect((await request()).status).toBe(403);
    expect(sbAdmin.from).not.toHaveBeenCalled();
  });
  it.each([
    'year=1999',
    'year=2101',
    'year=no',
    'year=2026&granularity=daily',
    'year=2026&userIds=invalid',
    'year=2026&walletIds=invalid',
  ])('rejects invalid query %s', async (query) => {
    const { sbAdmin } = setup();
    expect((await request(query)).status).toBe(400);
    expect(sbAdmin.from).not.toHaveBeenCalled();
  });
  it('forwards selected user and wallet filters', async () => {
    const { invoices } = setup();
    const id = '00000000-0000-4000-8000-000000000001';
    await request(`year=2026&userIds=${id}&walletIds=${id}`);
    expect(invoices.in).toHaveBeenCalledWith('customer_id', [id]);
    expect(invoices.in).toHaveBeenCalledWith('wallet_id', [id]);
  });
  it('loads all pages beyond the API default and aggregates all users', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      ...row(`i${i}`),
      customer_id: `u${i}`,
    }));
    const { invoices } = setup([
      { data: rows.slice(0, 500), count: 501, error: null },
      { data: rows.slice(500), count: 501, error: null },
    ]);
    const response = await request();
    expect(response.status).toBe(200);
    expect(invoices.range).toHaveBeenLastCalledWith(500, 999);
    expect((await response.json()).currencies[0].summary.paidUsers).toBe(501);
  });
  it.each([
    { data: [], count: 1, error: null },
    { data: [], count: null, error: null },
    { data: null, count: null, error: { message: 'failed' } },
    { data: [], count: 100001, error: null },
    { data: [row(), row()], count: 2, error: null },
  ])('refuses partial or duplicate results %j', async (page) => {
    setup([page]);
    expect((await request()).status).toBe(503);
  });
  it('rejects a changing snapshot across pages', async () => {
    setup([
      {
        data: Array.from({ length: 500 }, (_, i) => row(`i${i}`)),
        count: 501,
        error: null,
      },
      { data: [row('last')], count: 502, error: null },
    ]);
    expect((await request()).status).toBe(503);
  });
  it('rejects unresolved wallet currency instead of assigning a default', async () => {
    setup(undefined, { data: [], error: null });
    expect((await request()).status).toBe(503);
  });
  it('returns a valid empty report', async () => {
    setup([{ data: [], count: 0, error: null }]);
    const response = await request();
    expect(response.status).toBe(200);
    expect((await response.json()).currencies).toEqual([]);
  });
  it('fetches five tuition years for the yearly view', async () => {
    const { invoices } = setup();
    await request('year=2026&granularity=yearly');
    expect(invoices.or?.mock.calls[0]?.[0]).toContain(
      'subscription_months.ov.{2022-01-01'
    );
  });
});
