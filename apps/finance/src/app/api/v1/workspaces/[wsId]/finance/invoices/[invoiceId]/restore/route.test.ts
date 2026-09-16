import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), rpc: vi.fn() }));
vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: mocks.access,
}));
vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: vi.fn(),
}));

import { POST } from './route';

const invoiceId = '11111111-1111-4111-8111-111111111111';
const params = { params: Promise.resolve({ wsId: 'personal', invoiceId }) };
const request = () =>
  new Request('https://finance.test/restore', { method: 'POST' });
describe('invoice restore', () => {
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
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });
  it.each(['view_invoices', 'create_invoices', 'delete_invoices'])(
    'requires %s',
    async (permission) => {
      mocks.access.mockResolvedValue({
        context: {
          permissions: { withoutPermission: (p: string) => p === permission },
        },
      });
      expect((await POST(request(), params)).status).toBe(403);
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  );
  it('restores only in the authorized workspace with the authenticated actor', async () => {
    expect((await POST(request(), params)).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('admin_restore_finance_invoice', {
      p_ws_id: 'workspace-id',
      p_invoice_id: invoiceId,
      p_actor_id: 'actor-id',
    });
  });
  it('reports repeated or missing recovery snapshots', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await POST(request(), params)).status).toBe(404);
  });
  it.each(['23503', '23505', '23514'])(
    'reports reference conflicts %s without attempting partial writes',
    async (code) => {
      mocks.rpc.mockResolvedValue({ error: { code } });
      expect((await POST(request(), params)).status).toBe(409);
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
    }
  );
});
