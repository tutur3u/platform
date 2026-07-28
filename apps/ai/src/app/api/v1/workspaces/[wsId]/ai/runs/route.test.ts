import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  eq: vi.fn(),
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

function createRunsQuery(data: Record<string, unknown>[]) {
  const query = {
    eq: mocks.eq,
    from: vi.fn(),
    gte: vi.fn(),
    limit: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    or: vi.fn(),
    schema: vi.fn(),
    select: vi.fn(),
  };
  for (const method of [
    'eq',
    'from',
    'gte',
    'lt',
    'order',
    'or',
    'schema',
    'select',
  ] as const) {
    query[method].mockReturnValue(query);
  }
  query.limit.mockResolvedValue({ data, error: null });
  return query;
}

describe('AI Studio run logs API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the query tenant-scoped and omits sensitive run content', async () => {
    const query = createRunsQuery([
      {
        api_key_id: '6a8440d6-ecb8-4f2c-bc5b-7eb80524ad8b',
        billed_credits: '0',
        completed_at: '2026-07-28T01:00:02.000Z',
        created_at: '2026-07-28T01:00:00.000Z',
        embedding_units: 0,
        error_class: 'provider_timeout',
        error_message: 'raw provider response must never leave the server',
        feature: 'external-chat-completions',
        first_token_latency_ms: 50,
        id: '0b9bd97c-2a2e-447e-8446-4b05495968d2',
        image_units: 0,
        input_tokens: 12,
        latency_ms: 2_000,
        metadata: {
          prompt: 'secret prompt',
          provider_error: 'unsanitized provider payload',
        },
        model_id: 'google/gemini-2.5-flash',
        output_tokens: 8,
        provider_cost_usd: '0.0004',
        reasoning_tokens: 1,
        request_id: 'req-safe-id',
        status: 'failed',
        tool_arguments: { secret: true },
      },
    ]);
    mocks.authorize.mockResolvedValue({
      ok: true,
      sbAdmin: query,
      workspace: { id: 'workspace-1' },
    });

    const response = await GET(
      new NextRequest(
        'https://ai.example/runs?from=2026-07-01T00:00:00.000Z&to=2026-07-29T00:00:00.000Z'
      ),
      { params: Promise.resolve({ wsId: 'workspace-alias' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.eq).toHaveBeenCalledWith('ws_id', 'workspace-1');
    const payload = await response.json();
    expect(payload.runs[0]).toEqual(
      expect.objectContaining({
        errorClass: 'provider_timeout',
        requestId: 'req-safe-id',
        sourceType: 'api_key',
      })
    );
    expect(JSON.stringify(payload)).not.toContain('secret prompt');
    expect(JSON.stringify(payload)).not.toContain('unsanitized provider');
    expect(JSON.stringify(payload)).not.toContain('tool_arguments');
    expect(JSON.stringify(payload)).not.toContain('api_key_id');
  });
});
