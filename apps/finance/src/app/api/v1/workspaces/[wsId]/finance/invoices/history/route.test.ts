import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), rpc: vi.fn() }));
vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: mocks.access,
}));
vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: vi.fn(),
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { GET } from './route';

const params = { params: Promise.resolve({ wsId: 'personal' }) };
describe('invoice history access', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.access.mockResolvedValue({
      context: {
        normalizedWsId: 'workspace-id',
        user: { id: 'actor-id' },
        permissions: { withoutPermission: () => false },
        sbAdmin: { rpc: mocks.rpc },
      },
    });
    mocks.rpc.mockResolvedValue({ data: [], error: null });
  });
  it('requires audit permission as well as invoice visibility', async () => {
    mocks.access.mockResolvedValue({
      context: {
        permissions: {
          withoutPermission: (p: string) => p === 'manage_workspace_audit_logs',
        },
      },
    });
    expect(
      (await GET(new Request('https://finance.test/history'), params)).status
    ).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('binds normalized workspace and authenticated actor; never accepts an actor from query', async () => {
    const response = await GET(
      new Request(
        'https://finance.test/history?deletedOnly=true&offset=25&actorId=other'
      ),
      params
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.rpc).toHaveBeenCalledWith(
      'admin_get_finance_invoice_history',
      expect.objectContaining({
        p_ws_id: 'workspace-id',
        p_actor_id: 'actor-id',
        p_deleted_only: true,
        p_offset: 25,
        p_limit: 26,
      })
    );
  });
  it.each([
    'limit=1000',
    'offset=-1',
    'invoiceId=invalid',
    'deletedOnly=yes',
    'sort=bad',
    'entity=users',
    'action=TRUNCATE',
    'from=invalid',
    'from=2026-09-17T00:00:00Z&to=2026-09-16T00:00:00Z',
  ])('rejects invalid query %s before querying', async (query) => {
    expect(
      (await GET(new Request(`https://finance.test/history?${query}`), params))
        .status
    ).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('passes validated record, action, date, and sort filters to the scoped RPC', async () => {
    await GET(
      new Request(
        'https://finance.test/history?entity=promotion&action=UPDATE&sort=asc&from=2026-09-16T00:00:00Z&to=2026-09-17T00:00:00Z'
      ),
      params
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      'admin_get_finance_invoice_history',
      expect.objectContaining({
        p_entity: 'promotion',
        p_action: 'UPDATE',
        p_sort: 'asc',
        p_from: '2026-09-16T00:00:00Z',
        p_to: '2026-09-17T00:00:00Z',
      })
    );
  });
  it.each([0, 25, 26])(
    'returns a bounded page and accurate lookahead for %s results',
    async (count) => {
      const rows = Array.from({ length: count }, (_, id) => ({
        id: String(id),
      }));
      mocks.rpc.mockResolvedValue({ data: rows, error: null });
      const response = await GET(
        new Request('https://finance.test/history?limit=25'),
        params
      );
      expect(await response.json()).toEqual({
        data: rows.slice(0, 25),
        hasMore: count > 25,
      });
    }
  );
  it('does not turn a malformed history response into an empty audit trail', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const response = await GET(
      new Request('https://finance.test/history'),
      params
    );
    expect(response.status).toBe(500);
  });
  it('reports an unapplied migration without pretending the history is empty', async () => {
    mocks.rpc.mockResolvedValue({ error: { code: 'PGRST202' } });
    expect(
      (await GET(new Request('https://finance.test/history'), params)).status
    ).toBe(503);
  });
});
