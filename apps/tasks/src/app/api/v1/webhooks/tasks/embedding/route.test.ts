import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createMeteredTextEmbedding: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
  select: vi.fn(),
  selectEq: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
}));

vi.mock('@tuturuuu/ai/embeddings/metered', () => ({
  createMeteredTextEmbedding: (...args: unknown[]) =>
    mocks.createMeteredTextEmbedding(...args),
  GEMINI_EMBEDDING_2_DIMENSIONS: 3,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));

function createRequest({
  body = {
    old_record: null,
    record: {
      description: null,
      id: 'task-1',
      name: 'Test task',
    },
    table: 'tasks',
    type: 'INSERT',
  },
  secret,
}: {
  body?: Record<string, unknown>;
  secret?: string;
} = {}) {
  const json = vi.fn().mockResolvedValue(body);
  const headers = new Headers();

  if (secret !== undefined) {
    headers.set('x-webhook-secret', secret);
  }

  return {
    headers,
    json,
  } as unknown as Request & { json: ReturnType<typeof vi.fn> };
}

describe('task embedding webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_WEBHOOK_SECRET', 'configured-webhook-secret');

    mocks.maybeSingle.mockResolvedValue({
      data: {
        creator_id: 'user-1',
        id: 'task-1',
        task_lists: {
          workspace_boards: {
            ws_id: 'workspace-1',
          },
        },
      },
      error: null,
    });
    mocks.selectEq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.select.mockReturnValue({ eq: mocks.selectEq });
    mocks.updateEq.mockResolvedValue({ error: null });
    mocks.update.mockReturnValue({ eq: mocks.updateEq });
    mocks.from.mockReturnValue({
      select: mocks.select,
      update: mocks.update,
    });
    mocks.createAdminClient.mockResolvedValue({ from: mocks.from });
    mocks.createMeteredTextEmbedding.mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
      ok: true,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects missing server configuration before privileged work', async () => {
    vi.stubEnv('SUPABASE_WEBHOOK_SECRET', '');
    const request = createRequest({ secret: 'configured-webhook-secret' });
    const { POST } = await import('./route');

    const response = await POST(request);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Webhook secret is not configured',
    });
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.createMeteredTextEmbedding).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects a missing webhook header before privileged work', async () => {
    const request = createRequest();
    const { POST } = await import('./route');

    const response = await POST(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: 'Unauthorized',
    });
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.createMeteredTextEmbedding).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects a wrong webhook header before privileged work', async () => {
    const request = createRequest({ secret: 'wrong-webhook-secret' });
    const { POST } = await import('./route');

    const response = await POST(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: 'Unauthorized',
    });
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.createMeteredTextEmbedding).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('accepts the configured secret and generates an embedding', async () => {
    const request = createRequest({ secret: 'configured-webhook-secret' });
    const { POST } = await import('./route');

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: 'Embedding generated successfully',
      taskId: 'task-1',
    });
    expect(mocks.createAdminClient).toHaveBeenCalledOnce();
    expect(mocks.maybeSingle).toHaveBeenCalledOnce();
    expect(mocks.createMeteredTextEmbedding).toHaveBeenCalledWith({
      metadata: {
        operation: 'webhook_task_embedding_generation',
        taskId: 'task-1',
      },
      source: 'task_embedding',
      taskType: 'RETRIEVAL_DOCUMENT',
      userId: 'user-1',
      value: 'Test task',
      wsId: 'workspace-1',
    });
    expect(mocks.update).toHaveBeenCalledWith({
      embedding: JSON.stringify([0.1, 0.2, 0.3]),
    });
    expect(mocks.updateEq).toHaveBeenCalledWith('id', 'task-1');
  });

  it('keeps event validation with the configured secret', async () => {
    const request = createRequest({
      body: {
        old_record: null,
        record: { id: 'task-1', name: 'Test task' },
        table: 'task_lists',
        type: 'INSERT',
      },
      secret: 'configured-webhook-secret',
    });
    const { POST } = await import('./route');

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Invalid table',
    });
    expect(mocks.createAdminClient).toHaveBeenCalledOnce();
    expect(request.json).toHaveBeenCalledOnce();
    expect(mocks.createMeteredTextEmbedding).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
