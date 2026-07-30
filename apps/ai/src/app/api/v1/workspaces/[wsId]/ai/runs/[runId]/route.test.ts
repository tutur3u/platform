import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  runBuilder: {
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    select: vi.fn(),
  },
  stepsBuilder: {
    eq: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock('@/lib/session-api', () => ({
  authorizeAiStudioWorkspaceRequest: mocks.authorize,
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { GET } from './route';

describe('AI Studio run detail API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runBuilder.select.mockReturnValue(mocks.runBuilder);
    mocks.runBuilder.eq.mockReturnValue(mocks.runBuilder);
    mocks.stepsBuilder.select.mockReturnValue(mocks.stepsBuilder);
    mocks.stepsBuilder.eq.mockReturnValue(mocks.stepsBuilder);
    mocks.stepsBuilder.order.mockResolvedValue({
      data: [
        {
          billed_credits: '0.25',
          completed_at: '2026-07-30T01:00:01.000Z',
          error_class: null,
          input_tokens: 10,
          kind: 'tool',
          latency_ms: 12,
          metadata: { arguments: 'must not leave the server' },
          model_id: null,
          name: 'calculator',
          output_tokens: 0,
          provider_cost_usd: '0',
          sequence: 1,
          started_at: '2026-07-30T01:00:00.000Z',
          status: 'succeeded',
          tool_results: { secret: true },
        },
      ],
      error: null,
    });
    mocks.runBuilder.maybeSingle.mockResolvedValue({
      data: { id: '0b9bd97c-2a2e-447e-8446-4b05495968d2' },
      error: null,
    });
    mocks.authorize.mockResolvedValue({
      ok: true,
      sbAdmin: {
        schema: vi.fn().mockReturnValue({
          from: vi.fn((table: string) =>
            table === 'ai_studio_runs' ? mocks.runBuilder : mocks.stepsBuilder
          ),
        }),
      },
      user: { id: 'user-1' },
      workspace: { id: 'workspace-1' },
    });
  });

  it('binds the run to the authorized workspace and returns safe step fields', async () => {
    const response = await GET(new Request('https://ai.example/run'), {
      params: Promise.resolve({
        runId: '0b9bd97c-2a2e-447e-8446-4b05495968d2',
        wsId: 'workspace-alias',
      }),
    });

    expect(response.status).toBe(200);
    expect(mocks.runBuilder.eq).toHaveBeenCalledWith('ws_id', 'workspace-1');
    const payload = await response.json();
    expect(payload.steps[0]).toEqual(
      expect.objectContaining({
        kind: 'tool',
        name: 'calculator',
        sequence: 1,
      })
    );
    expect(JSON.stringify(payload)).not.toContain('must not leave');
    expect(JSON.stringify(payload)).not.toContain('tool_results');
    expect(JSON.stringify(payload)).not.toContain('metadata');
  });

  it('does not expose runs from another workspace', async () => {
    mocks.runBuilder.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const response = await GET(new Request('https://ai.example/run'), {
      params: Promise.resolve({
        runId: '0b9bd97c-2a2e-447e-8446-4b05495968d2',
        wsId: 'workspace-1',
      }),
    });

    expect(response.status).toBe(404);
    expect(mocks.stepsBuilder.select).not.toHaveBeenCalled();
  });
});
