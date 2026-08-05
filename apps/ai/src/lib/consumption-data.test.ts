import { describe, expect, it, vi } from 'vitest';
import {
  getAiStudioConsumptionBreakdown,
  listAiStudioConsumptionEvents,
} from './consumption-data';

const LEDGER_ROW = {
  amount: -228.182,
  cost_usd: 0.0218566,
  created_at: '2026-07-29T01:00:00.000Z',
  feature: 'chat',
  id: '00000000-0000-4000-8000-000000000001',
  image_count: 0,
  input_tokens: 71_570,
  metadata: null,
  model_id: 'gemini-3.5-flash-lite',
  output_tokens: 635,
  reasoning_tokens: 0,
  search_count: 0,
  user_id: 'user-1',
  ws_id: 'workspace-1',
};

describe('AI Studio consumption rollout fallback', () => {
  it('adds ordinary credit-ledger deductions when the new aggregate RPC is absent', async () => {
    const privateRpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202' },
      })
      .mockResolvedValueOnce({ data: [], error: null });
    const ledgerQuery = createThenableQuery([LEDGER_ROW]);
    const sbAdmin = {
      from: vi.fn().mockReturnValue(ledgerQuery),
      rpc: vi.fn().mockResolvedValue({ data: 'PRO', error: null }),
      schema: vi.fn().mockReturnValue({ rpc: privateRpc }),
    };

    const result = await getAiStudioConsumptionBreakdown({
      from: '2026-07-01T00:00:00.000Z',
      sbAdmin: sbAdmin as never,
      to: '2026-07-30T00:00:00.000Z',
      userId: 'user-1',
      workspaceId: 'workspace-1',
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      expect.objectContaining({
        billed_credits: 228.182,
        bucket_date: '2026-07-29',
        input_tokens: 71_570,
        latency_sample_count: 0,
        model_id: 'gemini-3.5-flash-lite',
        output_tokens: 635,
        provider_cost_usd: 0.0218566,
        request_count: 1,
        source_id: 'user-1',
        source_type: 'workspace_credit',
        succeeded_count: 1,
      }),
    ]);
    expect(privateRpc).toHaveBeenNthCalledWith(
      1,
      'get_ai_studio_consumption_breakdown',
      expect.objectContaining({ p_user_id: 'user-1' })
    );
    expect(privateRpc).toHaveBeenNthCalledWith(
      2,
      'get_ai_studio_usage_breakdown',
      expect.objectContaining({ p_ws_id: 'workspace-1' })
    );
  });

  it('returns sanitized credit-ledger log rows when the new event RPC is absent', async () => {
    const privateRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '42883' },
    });
    const studioQuery = createThenableQuery([]);
    const ledgerQuery = createThenableQuery([
      {
        ...LEDGER_ROW,
        id: '00000000-0000-4000-8000-000000000002',
        metadata: {
          run_id: '00000000-0000-4000-8000-000000000099',
        },
      },
      {
        ...LEDGER_ROW,
        metadata: {
          private_provider_payload: 'must not leak',
        },
      },
    ]);
    const linkedRunsQuery = createThenableQuery([
      { id: '00000000-0000-4000-8000-000000000099' },
    ]);
    const privateFrom = vi
      .fn()
      .mockReturnValueOnce(studioQuery)
      .mockReturnValueOnce(linkedRunsQuery);
    const sbAdmin = {
      from: vi.fn().mockReturnValue(ledgerQuery),
      rpc: vi.fn().mockResolvedValue({ data: 'PRO', error: null }),
      schema: vi.fn().mockReturnValue({
        from: privateFrom,
        rpc: privateRpc,
      }),
    };

    const result = await listAiStudioConsumptionEvents({
      cursor: null,
      from: '2026-07-01T00:00:00.000Z',
      limit: 50,
      sbAdmin: sbAdmin as never,
      to: '2026-07-30T00:00:00.000Z',
      userId: 'user-1',
      workspaceId: 'workspace-1',
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      {
        billed_credits: 228.182,
        completed_at: '2026-07-29T01:00:00.000Z',
        created_at: '2026-07-29T01:00:00.000Z',
        embedding_units: 0,
        error_class: null,
        event_id: '00000000-0000-4000-8000-000000000001',
        execution_mode: 'interactive',
        feature: 'chat',
        first_token_latency_ms: null,
        image_units: 0,
        input_tokens: 71_570,
        latency_ms: null,
        model_id: 'gemini-3.5-flash-lite',
        output_tokens: 635,
        provider_cost_usd: 0.0218566,
        reasoning_tokens: 0,
        request_id: 'credit:00000000-0000-4000-8000-000000000001',
        search_units: 0,
        // Retained now that the event feed reports which app or user spent:
        // it was previously stripped, which made per-app attribution impossible.
        source_id: 'user-1',
        source_type: 'workspace_credit',
        status: 'succeeded',
        unmetered_credits: 0,
      },
    ]);
    expect(JSON.stringify(result.data)).not.toContain(
      'private_provider_payload'
    );
  });

  it('reads every ledger page instead of truncating aggregate history', async () => {
    const privateRpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202' },
      })
      .mockResolvedValueOnce({ data: [], error: null });
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      ...LEDGER_ROW,
      amount: -1,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    }));
    const ledgerQuery = createThenableQuery([
      firstPage,
      [
        {
          ...LEDGER_ROW,
          amount: -1,
          id: '00000000-0000-4000-8000-000000001000',
        },
      ],
    ]);
    const sbAdmin = {
      from: vi.fn().mockReturnValue(ledgerQuery),
      rpc: vi.fn().mockResolvedValue({ data: 'PRO', error: null }),
      schema: vi.fn().mockReturnValue({ rpc: privateRpc }),
    };

    const result = await getAiStudioConsumptionBreakdown({
      from: '2026-07-01T00:00:00.000Z',
      sbAdmin: sbAdmin as never,
      to: '2026-07-30T00:00:00.000Z',
      userId: 'user-1',
      workspaceId: 'workspace-1',
    });

    expect(result.error).toBeNull();
    expect(result.data?.[0]).toEqual(
      expect.objectContaining({
        billed_credits: 1001,
        request_count: 1001,
      })
    );
    expect(ledgerQuery.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(ledgerQuery.range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });
});

function createThenableQuery<T>(data: T[] | T[][], error: unknown = null) {
  const pages =
    data.length > 0 && Array.isArray(data[0]) ? (data as T[][]) : [data as T[]];
  const query = Object.assign(
    Promise.resolve({ data: pages[0] ?? [], error }),
    {
      eq: vi.fn(),
      gte: vi.fn(),
      in: vi.fn(),
      limit: vi.fn(),
      lt: vi.fn(),
      or: vi.fn(),
      order: vi.fn(),
      range: vi.fn(),
      select: vi.fn(),
    }
  );

  for (const method of [
    query.eq,
    query.gte,
    query.limit,
    query.lt,
    query.in,
    query.or,
    query.order,
    query.select,
  ]) {
    method.mockReturnValue(query);
  }
  query.range.mockImplementation(() => {
    const pageIndex = Math.max(query.range.mock.calls.length - 1, 0);
    return Promise.resolve({
      data: pages[pageIndex] ?? [],
      error,
    });
  });

  return query;
}
