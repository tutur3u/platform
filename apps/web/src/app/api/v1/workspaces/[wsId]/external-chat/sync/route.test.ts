import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  listRuns: vi.fn(),
  readCheckpoint: vi.fn(),
  readExternalChatBinding: vi.fn(),
  insertRun: vi.fn(),
  requestExternalChatControl: vi.fn(),
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
      from: (table: string) => {
        if (table === 'external_chat_sync_runs')
          return {
            insert: () => ({
              select: () => ({ single: () => mocks.insertRun() }),
            }),
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => mocks.listRuns(),
                }),
              }),
            }),
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
    mocks.listRuns.mockResolvedValue({ data: [localRun], error: null });
    mocks.readCheckpoint.mockResolvedValue({ data: null, error: null });
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
      { runId: localRun.id }
    );
    expect(mocks.updateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        finished_at: '2026-08-04T00:02:00.000Z',
        state: 'completed',
        target_counts: { messages: 3 },
      })
    );
    expect(await response.json()).toEqual(
      expect.objectContaining({
        runs: [expect.objectContaining({ state: 'completed' })],
      })
    );
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
    expect(mocks.updateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        finished_at: expect.any(String),
        high_water_mark: { messages: '3' },
        source_counts: { messages: 3 },
        state: 'completed',
      })
    );
  });
});
