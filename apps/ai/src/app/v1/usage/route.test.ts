import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  first: vi.fn(),
  range: vi.fn(),
  filter: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('@/lib/public-credential', () => ({
  authenticatePublicAiRequest: mocks.auth,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({ limit: () => ({ maybeSingle: mocks.first }) }),
            }),
          }),
        }),
      }),
      rpc: mocks.rpc,
    }),
  }),
}));

import { GET } from './route';

const ws = 'b9999999-9999-4999-8999-999999999991';
const request = (workspace = ws) =>
  new Request('https://ai.tuturuuu.com/v1/usage', {
    headers: { 'x-tuturuuu-workspace-id': workspace },
  });
const row = {
  bucket_date: '2026-09-01',
  model_id: 'google/gemini',
  feature: 'analysis',
  execution_mode: 'background',
  provider_cost_usd: 0.4,
  request_count: 2,
  failed_count: 1,
  input_tokens: 100,
  output_tokens: 20,
  billed_credits: 0,
  unmetered_credits: 40,
  source_type: 'external_app',
  source_id: 'cs35',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    kind: 'api-key',
    workspaceId: ws,
    actorId: ws,
    apiKey: { external_app_id: 'cs35' },
  });
  mocks.first.mockResolvedValue({
    data: { created_at: '2026-09-01T00:00:00Z' },
    error: null,
  });
  mocks.range.mockResolvedValue({ data: [row], error: null });
  const query = { eq: mocks.filter, range: mocks.range };
  mocks.filter.mockReturnValue(query);
  mocks.rpc.mockReturnValue(query);
});
describe('app usage reporting', () => {
  it('returns metered costs and dimensions scoped to the authenticated app', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect((await response.json()).rows[0]).toMatchObject({
      amountUsd: 0.4,
      executionMode: 'background',
      requests: 2,
    });
    expect(mocks.filter).toHaveBeenCalledWith('source_id', 'cs35');
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_ai_studio_consumption_breakdown',
      expect.objectContaining({ p_ws_id: ws })
    );
  });
  it('rejects mismatched workspaces and unbound keys before reading costs', async () => {
    expect((await GET(request('other'))).status).toBe(403);
    mocks.auth.mockResolvedValue({
      kind: 'api-key',
      workspaceId: ws,
      apiKey: {},
    });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.first).not.toHaveBeenCalled();
  });
  it('fails closed if a returned row belongs to another app', async () => {
    mocks.range.mockResolvedValue({
      data: [{ ...row, source_id: 'another' }],
      error: null,
    });
    expect((await GET(request())).status).toBe(503);
  });
  it('does not truncate histories at the database page limit', async () => {
    mocks.range
      .mockResolvedValueOnce({
        data: Array.from({ length: 500 }, () => row),
        error: null,
      })
      .mockResolvedValueOnce({ data: [row], error: null });
    expect((await (await GET(request())).json()).rows).toHaveLength(501);
    expect(mocks.range).toHaveBeenNthCalledWith(2, 500, 999);
  });
  it('preserves an empty ledger and fails on database errors', async () => {
    mocks.first.mockResolvedValueOnce({ data: null, error: null });
    expect((await (await GET(request())).json()).rows).toEqual([]);
    mocks.first.mockResolvedValueOnce({
      data: null,
      error: { code: 'unavailable' },
    });
    expect((await GET(request())).status).toBe(503);
  });
  it('splits history older than a year into non-overlapping legal windows', async () => {
    mocks.first.mockResolvedValue({
      data: { created_at: '2024-01-01T00:00:00Z' },
      error: null,
    });
    mocks.range.mockResolvedValue({ data: [], error: null });
    expect((await GET(request())).status).toBe(200);
    expect(mocks.rpc.mock.calls.length).toBeGreaterThan(1);
    const ranges = mocks.rpc.mock.calls.map((call) => call[1]);
    for (let i = 1; i < ranges.length; i++)
      expect(ranges[i].p_from).toBe(ranges[i - 1].p_to);
  });
});
