import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  compareAndSetRun: vi.fn(),
  listRuns: vi.fn(),
  readRun: vi.fn(),
  readRunFilter: vi.fn(),
  readCheckpoint: vi.fn(),
  readExternalChatBinding: vi.fn(),
  insertRun: vi.fn(),
  requestExternalChatControl: vi.fn(),
  transitionRun: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  updateRun: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown, params: unknown) => Response) =>
    async (request: Request, routeContext?: { params?: Promise<unknown> }) =>
      handler(request, { user: { id: 'user-1' } }, await routeContext?.params),
}));

vi.mock('@/lib/chat/private-rpc', () => ({
  resolveChatRouteContext: (...args: unknown[]) =>
    mocks.resolveChatRouteContext(...args),
}));

vi.mock('@/lib/external-chat/delivery', () => ({
  createExternalChatControlClient: vi.fn(
    async () =>
      (path: string, payload: Record<string, unknown>, options?: unknown) =>
        mocks.requestExternalChatControl('workspace-1', path, payload, options)
  ),
  requestExternalChatControl: (...args: unknown[]) =>
    mocks.requestExternalChatControl(...args),
}));

vi.mock('@/lib/external-chat/store', () => ({
  readExternalChatBinding: (...args: unknown[]) =>
    mocks.readExternalChatBinding(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    schema: () => ({
      rpc: (name: string, args: unknown) =>
        name === 'external_chat_transition_sync_run'
          ? mocks.transitionRun(name, args)
          : mocks.compareAndSetRun(name, args),
      from: (table: string) => {
        if (table === 'external_chat_sync_runs')
          return {
            insert: () => ({
              select: () => ({ single: () => mocks.insertRun() }),
            }),
            select: () => {
              const query = {
                eq: (column: string, value: unknown) => {
                  mocks.readRunFilter(column, value);
                  return query;
                },
                maybeSingle: () => mocks.readRun(),
                order: () => ({ limit: () => mocks.listRuns() }),
              };
              return query;
            },
            update: (update: Record<string, unknown>) => ({
              eq: () => ({ eq: () => mocks.updateRun(update) }),
            }),
            upsert: (...args: unknown[]) => mocks.upsert(...args),
          };
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => mocks.readCheckpoint(),
            }),
          }),
        };
      },
    }),
  })),
}));

const params = { params: Promise.resolve({ wsId: 'workspace-1' }) };
const localRun = {
  created_at: '2026-08-04T00:00:00.000Z',
  cursor: { messages: '3' },
  digest_results: [],
  error_code: null,
  finished_at: '2026-08-04T00:01:00.000Z',
  high_water_mark: { messages: '3' },
  id: '7a3eb868-6bb9-46da-b803-a96703e4df5f',
  operation: 'backfill',
  source_counts: { messages: 3 },
  started_at: '2026-08-04T00:00:01.000Z',
  state: 'completed',
  target_counts: { messages: 3 },
  updated_at: '2026-08-04T00:01:00.000Z',
};

describe('external chat sync status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveChatRouteContext.mockResolvedValue({
      context: { normalizedWsId: 'workspace-1' },
      ok: true,
    });
    mocks.readExternalChatBinding.mockResolvedValue({
      binding: { canonical_project_id: 'opaque-connector' },
    });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.insertRun.mockResolvedValue({
      data: { id: localRun.id },
      error: null,
    });
    mocks.updateRun.mockResolvedValue({ error: null });
    mocks.compareAndSetRun.mockResolvedValue({ data: true, error: null });
    mocks.transitionRun.mockResolvedValue({ data: true, error: null });
    mocks.listRuns.mockResolvedValue({ data: [localRun], error: null });
    mocks.readCheckpoint.mockResolvedValue({ data: null, error: null });
    mocks.readRun.mockResolvedValue({
      data: { started_at: localRun.started_at },
      error: null,
    });
  });

  it('returns stored status without polling or writing to the bridge', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/sync') as never,
      params
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      checkpoint: null,
      runs: [localRun],
    });
    expect(mocks.requestExternalChatControl).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('returns a stable error when stored status cannot be read', async () => {
    mocks.listRuns.mockResolvedValueOnce({
      data: null,
      error: { message: 'sensitive database failure' },
    });
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/sync') as never,
      params
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'sync_status_unavailable' });
  });

  it('refreshes active runs from the bridge and persists completion', async () => {
    const runningRun = {
      ...localRun,
      digest_results: [],
      finished_at: null,
      state: 'running',
      target_counts: {},
    };
    mocks.listRuns.mockResolvedValueOnce({ data: [runningRun], error: null });
    mocks.requestExternalChatControl.mockResolvedValueOnce({
      runs: [
        {
          digestResults: [{ matched: true, stream: 'messages' }],
          finishedAt: '2026-08-04T00:02:00.000Z',
          runId: localRun.id,
          state: 'completed',
          targetCounts: { messages: 3 },
        },
      ],
    });
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/sync') as never,
      params
    );

    expect(response.status).toBe(200);
    expect(mocks.requestExternalChatControl).toHaveBeenCalledWith(
      'workspace-1',
      '/control/v1/sync/status',
      { runId: localRun.id },
      { timeoutMs: 2500 }
    );
    expect(mocks.compareAndSetRun).toHaveBeenCalledWith(
      'external_chat_compare_and_set_sync_run',
      expect.objectContaining({
        p_expected_state: 'running',
        p_expected_updated_at: runningRun.updated_at,
        p_update: expect.objectContaining({
          finished_at: '2026-08-04T00:02:00.000Z',
          state: 'completed',
          target_counts: { messages: 3 },
        }),
      })
    );
    expect(await response.json()).toEqual(
      expect.objectContaining({
        runs: [expect.objectContaining({ state: 'completed' })],
      })
    );
  });

  it('keeps the local run when a newer transition wins the refresh race', async () => {
    const runningRun = {
      ...localRun,
      finished_at: null,
      state: 'running',
    };
    mocks.listRuns.mockResolvedValueOnce({ data: [runningRun], error: null });
    mocks.requestExternalChatControl.mockResolvedValueOnce({
      runId: localRun.id,
      state: 'completed',
    });
    mocks.compareAndSetRun.mockResolvedValueOnce({ data: false, error: null });
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/sync') as never,
      params
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      checkpoint: null,
      runs: [runningRun],
    });
  });

  it('persists an immediately completed audit response', async () => {
    mocks.requestExternalChatControl.mockResolvedValueOnce({
      highWater: { messages: '3' },
      runId: localRun.id,
      sourceCounts: { messages: 3 },
      state: 'completed',
    });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/sync', {
        body: JSON.stringify({ action: 'audit' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }) as never,
      params
    );

    expect(response.status).toBe(200);
    expect(mocks.insertRun).toHaveBeenCalledTimes(1);
    expect(mocks.requestExternalChatControl).toHaveBeenCalledWith(
      'workspace-1',
      '/control/v1/sync/audit',
      { runId: localRun.id, stream: 'canonical' }
    );
    expect(mocks.transitionRun).toHaveBeenCalledWith(
      'external_chat_transition_sync_run',
      expect.objectContaining({
        p_expected_states: ['pending'],
        p_update: expect.objectContaining({
          finished_at: expect.any(String),
          high_water_mark: { messages: '3' },
          source_counts: { messages: 3 },
          started_at: expect.any(String),
          state: 'completed',
        }),
      })
    );
  });

  it('forwards a validated agent scope for a bounded backfill', async () => {
    mocks.requestExternalChatControl.mockResolvedValueOnce({
      runId: localRun.id,
      scope: { agentId: '7' },
      state: 'running',
    });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/sync', {
        body: JSON.stringify({ action: 'start', agentId: '7' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }) as never,
      params
    );

    expect(response.status).toBe(200);
    expect(mocks.requestExternalChatControl).toHaveBeenCalledWith(
      'workspace-1',
      '/control/v1/sync/start',
      { agentId: '7', runId: localRun.id, stream: 'canonical' }
    );
  });

  it.each(['all', '0', '01', '123456789012345678901'])(
    'rejects invalid agent scope %s before creating a run',
    async (agentId) => {
      const { POST } = await import('./route');
      const response = await POST(
        new Request('http://localhost/sync', {
          body: JSON.stringify({ action: 'start', agentId }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        }) as never,
        params
      );

      expect(response.status).toBe(400);
      expect(mocks.requestExternalChatControl).not.toHaveBeenCalled();
      expect(mocks.insertRun).not.toHaveBeenCalled();
    }
  );

  it('accepts a 20-digit agent scope', async () => {
    const agentId = '12345678901234567890';
    mocks.requestExternalChatControl.mockResolvedValueOnce({
      runId: localRun.id,
      scope: { agentId },
      state: 'running',
    });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/sync', {
        body: JSON.stringify({ action: 'start', agentId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }) as never,
      params
    );

    expect(response.status).toBe(200);
    expect(mocks.requestExternalChatControl).toHaveBeenCalledWith(
      'workspace-1',
      '/control/v1/sync/start',
      { agentId, runId: localRun.id, stream: 'canonical' }
    );
  });

  it('rejects a stale control result when the run changed concurrently', async () => {
    mocks.requestExternalChatControl.mockResolvedValueOnce({
      runId: localRun.id,
      state: 'completed',
    });
    mocks.transitionRun.mockResolvedValueOnce({ data: false, error: null });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/sync', {
        body: JSON.stringify({ action: 'audit' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }) as never,
      params
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'sync_run_changed',
      runId: localRun.id,
    });
    expect(mocks.transitionRun).toHaveBeenCalledTimes(1);
  });

  it('does not invent a start time when cancelling a pending run', async () => {
    mocks.readRun.mockResolvedValueOnce({
      data: { started_at: null },
      error: null,
    });
    mocks.requestExternalChatControl.mockResolvedValueOnce({
      runId: localRun.id,
      state: 'cancelled',
    });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/sync', {
        body: JSON.stringify({ action: 'cancel', runId: localRun.id }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }) as never,
      params
    );

    expect(response.status).toBe(200);
    expect(mocks.transitionRun).toHaveBeenCalledWith(
      'external_chat_transition_sync_run',
      expect.objectContaining({
        p_expected_states: ['pending', 'running'],
        p_update: expect.not.objectContaining({
          started_at: expect.anything(),
        }),
      })
    );
  });

  it('allows failed runs to resume', async () => {
    mocks.requestExternalChatControl.mockResolvedValueOnce({
      runId: localRun.id,
      state: 'running',
    });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/sync', {
        body: JSON.stringify({ action: 'resume', runId: localRun.id }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }) as never,
      params
    );

    expect(response.status).toBe(200);
    expect(mocks.transitionRun).toHaveBeenCalledWith(
      'external_chat_transition_sync_run',
      expect.objectContaining({
        p_expected_states: ['failed', 'paused'],
        p_update: expect.objectContaining({
          error_code: null,
          finished_at: null,
          state: 'running',
        }),
      })
    );
    const update = mocks.transitionRun.mock.calls[0]?.[1]?.p_update;
    expect(update).not.toHaveProperty('started_at');
  });

  it('rejects a run from the connector used before rebinding', async () => {
    mocks.readRun.mockResolvedValueOnce({ data: null, error: null });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/sync', {
        body: JSON.stringify({ action: 'resume', runId: localRun.id }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }) as never,
      params
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'sync_run_not_found' });
    expect(mocks.readRunFilter).toHaveBeenCalledWith(
      'connector_key',
      'opaque-connector'
    );
    expect(mocks.requestExternalChatControl).not.toHaveBeenCalled();
  });
});
