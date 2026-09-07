import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  rpc: vi.fn(),
  range: vi.fn(),
}));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('@/lib/session-api', () => ({
  authorizeAiStudioWorkspaceRequest: mocks.authorize,
}));

import { GET } from './route';

const context = { params: Promise.resolve({ wsId: 'workspace-alias' }) };
const row = {
  ws_id: 'resolved-workspace',
  actor_id: 'private-actor',
  app_id: 'cs35',
  reference: 'test-invoice',
  amount_usd: 1.25,
};
beforeEach(() => {
  mocks.authorize.mockReset().mockResolvedValue({
    ok: true,
    workspace: { id: 'resolved-workspace' },
    sbAdmin: { schema: () => ({ rpc: mocks.rpc }) },
  });
  mocks.rpc.mockReset().mockReturnValue({ range: mocks.range });
  mocks.range.mockReset().mockResolvedValue({ data: [row], error: null });
});
describe('invoice history authorization and completeness', () => {
  it('uses authorized workspace and omits actor identity', async () => {
    const response = await GET(new Request('https://example.test'), context);
    expect(mocks.authorize).toHaveBeenCalledWith(
      'workspace-alias',
      'use_ai_studio'
    );
    expect(mocks.rpc).toHaveBeenCalledWith('get_external_provider_invoices', {
      p_ws_id: 'resolved-workspace',
    });
    expect(await response.json()).toEqual({
      currency: 'USD',
      rows: [{ app_id: 'cs35', reference: 'test-invoice', amount_usd: 1.25 }],
    });
  });
  it('does not query without membership and permission', async () => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    });
    expect(
      (await GET(new Request('https://example.test'), context)).status
    ).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('paginates rather than silently truncating all-time totals', async () => {
    mocks.range
      .mockResolvedValueOnce({
        data: Array.from({ length: 500 }, () => row),
        error: null,
      })
      .mockResolvedValueOnce({ data: [row], error: null });
    const response = await GET(new Request('https://example.test'), context);
    expect((await response.json()).rows).toHaveLength(501);
    expect(mocks.range).toHaveBeenLastCalledWith(500, 999);
  });
  it('fails closed rather than returning a partial invoice total', async () => {
    mocks.range.mockResolvedValue({ data: null, error: { code: 'error' } });
    expect(
      (await GET(new Request('https://example.test'), context)).status
    ).toBe(503);
  });
});
