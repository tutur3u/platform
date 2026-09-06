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
  provider: 'apify',
  externalRunId: 'run1',
  service: 'facebook',
  amountUsd: 0.126,
  currency: 'USD',
  source: 'provider_api',
  occurredAt: '2026-07-01T00:00:00Z',
  observedAt: '2026-08-01T00:00:00Z',
};
const request = (body: unknown = cost, workspace = ws) =>
  new Request('https://ai.tuturuuu.com/v1/provider-costs', {
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
describe('provider cost endpoint', () => {
  it('attributes costs using the authenticated app and returns a receipt', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      externalRunId: 'run1',
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      'record_external_provider_cost',
      expect.objectContaining({
        p_ws_id: ws,
        p_app_id: 'cs35',
        p_amount_usd: 0.126,
        p_occurred_at: cost.occurredAt,
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
  it('validates dedicated account days before acknowledging them', async () => {
    expect(
      (
        await POST(
          request({
            ...cost,
            granularity: 'account_day',
            accountId: 'account1',
          })
        )
      ).status
    ).toBe(200);
    expect(
      (await POST(request({ ...cost, granularity: 'account_day' }))).status
    ).toBe(400);
    expect(
      (
        await POST(
          request({
            ...cost,
            granularity: 'account_day',
            accountId: 'account1',
            occurredAt: '2026-07-01T01:00:00Z',
          })
        )
      ).status
    ).toBe(400);
  });
  it('never acknowledges a failed database write', async () => {
    mocks.rpc.mockResolvedValue({ error: { code: 'PGRST202' } });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('accepted');
  });
});
