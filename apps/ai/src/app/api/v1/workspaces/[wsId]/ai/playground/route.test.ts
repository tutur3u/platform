import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  execute: vi.fn(),
  listModels: vi.fn(),
  parse: vi.fn((value) => value),
}));

vi.mock('@/lib/session-api', () => ({
  authorizeAiStudioWorkspaceRequest: mocks.authorize,
}));
vi.mock('@/lib/public-api', () => ({
  listAllowedModels: mocks.listModels,
  publicApiError: (error: Error & { code?: string; status?: number }) =>
    Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status ?? 500 }
    ),
}));
vi.mock('@/lib/text-execution', () => ({
  executeTextRequest: mocks.execute,
  parseTextRequest: mocks.parse,
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { GET, POST } from './route';

const KEY_ID = '0b9bd97c-2a2e-447e-8446-4b05495968d2';
const context = { params: Promise.resolve({ wsId: 'workspace-alias' }) };

function authorizeWithKey(overrides = {}) {
  const chain = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        created_by: 'creator-1',
        expires_at: null,
        id: KEY_ID,
        revoked_at: null,
        ws_id: 'workspace-1',
        ...overrides,
      },
      error: null,
    }),
    select: vi.fn().mockReturnThis(),
  };
  mocks.authorize.mockResolvedValue({
    ok: true,
    sbAdmin: {
      schema: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue(chain),
      }),
    },
    user: { id: 'current-user' },
    workspace: { id: 'workspace-1' },
  });
  return chain;
}

describe('AI Studio saved-key playground route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads allowed models with the saved key kept server-side', async () => {
    const chain = authorizeWithKey({ secret_hash: 'never-return-this' });
    mocks.listModels.mockResolvedValue([
      {
        context_window: 128_000,
        id: 'openai/gpt-5-mini',
        max_tokens: 8192,
        name: 'GPT 5 Mini',
        provider: 'openai',
        type: 'language',
      },
    ]);

    const response = await GET(
      new Request(`https://ai.example/playground?keyId=${KEY_ID}`),
      context
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(chain.eq).toHaveBeenCalledWith('ws_id', 'workspace-1');
    expect(payload.data[0]).toEqual(
      expect.objectContaining({ id: 'openai/gpt-5-mini', type: 'language' })
    );
    expect(JSON.stringify(payload)).not.toContain('never-return-this');
  });

  it('runs as the current authorized user while metering the selected key', async () => {
    authorizeWithKey();
    mocks.execute.mockResolvedValue(Response.json({ id: 'request-1' }));

    const response = await POST(
      new Request('https://ai.example/playground', {
        body: JSON.stringify({
          endpoint: 'responses',
          keyId: KEY_ID,
          maxOutputTokens: 1024,
          maxSteps: 4,
          model: 'openai/gpt-5-mini',
          prompt: 'Hello',
          tools: [],
        }),
        method: 'POST',
      }),
      context
    );

    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ model: 'openai/gpt-5-mini' }),
      expect.objectContaining({
        credential: expect.objectContaining({
          actorId: 'current-user',
          apiKey: expect.objectContaining({ id: KEY_ID }),
          kind: 'api-key',
        }),
      })
    );
  });

  it('rejects revoked saved keys before execution', async () => {
    authorizeWithKey({ revoked_at: '2026-08-01T00:00:00.000Z' });

    const response = await POST(
      new Request('https://ai.example/playground', {
        body: JSON.stringify({
          endpoint: 'responses',
          keyId: KEY_ID,
          maxOutputTokens: 1024,
          maxSteps: 4,
          model: 'openai/gpt-5-mini',
          prompt: 'Hello',
          tools: [],
        }),
        method: 'POST',
      }),
      context
    );

    expect(response.status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
