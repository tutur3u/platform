import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/public-credential', () => ({
  authenticatePublicAiRequest: mocks.authenticate,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ schema: () => ({ rpc: mocks.rpc }) }),
}));

import { POST } from './route';

const ws = 'b9999999-9999-4999-8999-999999999991';
const cost = {
  provider: 'neon',
  accountId: 'dedicated',
  reference: 'test-invoice',
  issuedOn: '2026-01-01',
  reviewedOn: '2026-01-02',
  amountUsd: 1.25,
  currency: 'USD',
  status: 'paid',
  source: 'reviewed_provider_invoice',
};
const request = (body: unknown = cost, workspace = ws) =>
  new Request('https://ai.tuturuuu.com/v1/provider-invoices', {
    method: 'POST',
    headers: { 'x-tuturuuu-workspace-id': workspace },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  mocks.authenticate.mockResolvedValue({
    kind: 'api-key',
    workspaceId: ws,
    actorId: ws,
    apiKey: { external_app_id: 'cs35' },
  });
  mocks.rpc.mockReset().mockResolvedValue({ error: null });
});
describe('provider invoice endpoint', () => {
  it('attributes costs using the authenticated app and returns a receipt', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      reference: 'test-invoice',
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      'record_external_provider_invoice',
      expect.objectContaining({
        p_ws_id: ws,
        p_app_id: 'cs35',
        p_amount_usd: 1.25,
        p_issued_on: cost.issuedOn,
      })
    );
  });
  it('rejects unbound keys and workspace mismatch before persistence', async () => {
    expect((await POST(request(cost, 'other'))).status).toBe(403);
    mocks.authenticate.mockResolvedValue({
      kind: 'api-key',
      workspaceId: ws,
      apiKey: {},
    });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('accepts verified session attribution', async () => {
    mocks.authenticate.mockResolvedValue({
      kind: 'external-app',
      workspaceId: ws,
      actorId: ws,
      appId: 'cs35',
    });
    expect((await POST(request())).status).toBe(200);
  });
  it('rejects payload injection and excessive bodies', async () => {
    expect((await POST(request({ ...cost, appId: 'other' }))).status).toBe(400);
    expect((await POST(request({ padding: 'x'.repeat(9000) }))).status).toBe(
      413
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects conflicting retained snapshots', async () => {
    mocks.rpc.mockResolvedValue({ error: { code: '23505' } });
    expect((await POST(request())).status).toBe(409);
  });
  it('rejects invalid dates, amounts and usage provenance', async () => {
    for (const change of [
      { amountUsd: -1 },
      { source: 'provider_api' },
      { reviewedOn: '2020-01-01' },
      { reviewedOn: '2999-01-01' },
    ]) {
      expect((await POST(request({ ...cost, ...change }))).status).toBe(400);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
