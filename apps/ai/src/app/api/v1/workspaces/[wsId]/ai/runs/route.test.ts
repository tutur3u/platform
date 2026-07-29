import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/session-api', () => ({
  authorizeAiStudioWorkspaceRequest: mocks.authorize,
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

describe('AI Studio consumption logs API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({
      ok: true,
      sbAdmin: {
        schema: vi.fn().mockReturnValue({ rpc: mocks.rpc }),
      },
      user: { id: 'user-1' },
      workspace: { id: 'workspace-1' },
    });
  });

  it('uses the combined tenant scope and omits sensitive content', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          billed_credits: '4.25',
          completed_at: '2026-07-28T01:00:02.000Z',
          created_at: '2026-07-28T01:00:00.000Z',
          embedding_units: 0,
          error_class: null,
          event_id: '0b9bd97c-2a2e-447e-8446-4b05495968d2',
          feature: 'chat',
          first_token_latency_ms: null,
          image_units: 0,
          input_tokens: 12,
          latency_ms: null,
          metadata: { prompt: 'must never leave the server' },
          model_id: 'google/gemini-2.5-flash',
          output_tokens: 8,
          provider_cost_usd: '0.0004',
          reasoning_tokens: 1,
          request_id: 'credit:safe-id',
          search_units: 2,
          source_type: 'workspace_credit',
          status: 'succeeded',
          tool_arguments: { secret: true },
        },
      ],
      error: null,
    });

    const response = await GET(
      new NextRequest(
        'https://ai.example/runs?from=2026-07-01T00:00:00.000Z&to=2026-07-29T00:00:00.000Z'
      ),
      { params: Promise.resolve({ wsId: 'workspace-alias' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'list_ai_studio_consumption_events',
      expect.objectContaining({
        p_limit: 51,
        p_user_id: 'user-1',
        p_ws_id: 'workspace-1',
      })
    );
    const payload = await response.json();
    expect(payload.runs[0]).toEqual(
      expect.objectContaining({
        billedCredits: 4.25,
        requestId: 'credit:safe-id',
        searchUnits: 2,
        sourceType: 'workspace_credit',
      })
    );
    expect(JSON.stringify(payload)).not.toContain('must never leave');
    expect(JSON.stringify(payload)).not.toContain('tool_arguments');
    expect(JSON.stringify(payload)).not.toContain('metadata');
  });

  it('rejects invalid statuses before querying consumption events', async () => {
    const response = await GET(
      new NextRequest(
        'https://ai.example/runs?from=2026-07-01T00:00:00.000Z&to=2026-07-29T00:00:00.000Z&status=unknown'
      ),
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
