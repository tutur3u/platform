import { describe, expect, it, vi } from 'vitest';
import { getAiStudioConsumptionBreakdown } from './consumption-data';

describe('AI Studio consumption rollout fallback', () => {
  it('falls back to the legacy Studio-only aggregate when the new RPC is absent', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202' },
      })
      .mockResolvedValueOnce({
        data: [
          {
            aborted_count: 0,
            average_latency_ms: 150,
            billed_credits: 3,
            bucket_date: '2026-07-29',
            embedding_units: 0,
            failed_count: 0,
            feature: 'chat',
            image_units: 0,
            input_tokens: 10,
            model_id: 'model-a',
            output_tokens: 5,
            provider_cost_usd: 0.001,
            reasoning_tokens: 0,
            request_count: 1,
            source_id: 'session',
            source_type: 'session',
            succeeded_count: 1,
          },
        ],
        error: null,
      });
    const sbAdmin = {
      schema: vi.fn().mockReturnValue({ rpc }),
    };

    const result = await getAiStudioConsumptionBreakdown({
      from: '2026-07-01T00:00:00.000Z',
      sbAdmin: sbAdmin as never,
      to: '2026-07-30T00:00:00.000Z',
      userId: 'user-1',
      workspaceId: 'workspace-1',
    });

    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'get_ai_studio_consumption_breakdown',
      expect.objectContaining({ p_user_id: 'user-1' })
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'get_ai_studio_usage_breakdown',
      expect.objectContaining({ p_ws_id: 'workspace-1' })
    );
    expect(result.data?.[0]).toEqual(
      expect.objectContaining({
        latency_sample_count: 1,
        search_units: 0,
      })
    );
  });
});
