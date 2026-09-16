import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: mocks.access,
}));
vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: vi.fn(),
}));

import { DELETE, PUT } from './route';

const invoiceId = '11111111-1111-4111-8111-111111111111';
const params = { params: Promise.resolve({ wsId: 'personal', invoiceId }) };
const request = (method: string, body?: unknown) =>
  new Request('https://finance.test/invoice', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
describe('atomic invoice mutations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: mocks.maybeSingle,
    };
    mocks.access.mockResolvedValue({
      context: {
        normalizedWsId: 'workspace-id',
        user: { id: 'actor-id' },
        permissions: { withoutPermission: () => false },
        sbAdmin: { rpc: mocks.rpc, from: () => builder },
      },
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.maybeSingle.mockResolvedValue({
      data: { id: invoiceId, wallet_id: 'wallet-id' },
      error: null,
    });
  });
  it('uses one actor-stamped RPC instead of sequential destructive writes', async () => {
    expect((await DELETE(request('DELETE'), params)).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      'admin_delete_finance_invoice',
      {
        p_ws_id: 'workspace-id',
        p_invoice_id: invoiceId,
        p_actor_id: 'actor-id',
      }
    );
  });
  it('fails closed if recovery migration is not deployed', async () => {
    mocks.rpc.mockResolvedValue({ error: { code: 'PGRST202' } });
    expect((await DELETE(request('DELETE'), params)).status).toBe(503);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('rejects deletion of invoices with unrelated transaction links', async () => {
    mocks.rpc.mockResolvedValue({ error: { code: '23503' } });
    expect((await DELETE(request('DELETE'), params)).status).toBe(409);
  });
  it('reports a raced or missing invoice instead of false success', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await DELETE(request('DELETE'), params)).status).toBe(404);
  });
  it('preserves omitted fields and records the update actor', async () => {
    expect(
      (await PUT(request('PUT', { note: 'Changed' }), params)).status
    ).toBe(200);
    const payload = mocks.rpc.mock.calls[0]?.[1];
    expect(payload.p_actor_id).toBe('actor-id');
    expect(JSON.parse(JSON.stringify(payload.p_payload))).toEqual({
      note: 'Changed',
    });
  });
  it('supports deliberately clearing a note', async () => {
    expect((await PUT(request('PUT', { note: null }), params)).status).toBe(
      200
    );
    expect(mocks.rpc.mock.calls[0]?.[1].p_payload.note).toBeNull();
  });
  it('rejects invalid JSON', async () => {
    expect(
      (
        await PUT(
          new Request('https://finance.test/invoice', {
            method: 'PUT',
            body: '{',
          }),
          params
        )
      ).status
    ).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
