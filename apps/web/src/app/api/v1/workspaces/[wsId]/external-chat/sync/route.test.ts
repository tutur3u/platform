import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  readExternalChatBinding: vi.fn(),
  requestExternalChatControl: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  upsert: vi.fn(),
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
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
            upsert: (...args: unknown[]) => mocks.upsert(...args),
          };
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      },
    }),
  })),
}));

const params = { params: Promise.resolve({ wsId: 'workspace-1' }) };
const remoteRun = {
  createdAt: '2026-08-04T00:00:00.000Z',
  digestResults: [],
  errorCode: null,
  finishedAt: '2026-08-04T00:01:00.000Z',
  highWater: { messages: '3' },
  operation: 'backfill',
  runId: '7a3eb868-6bb9-46da-b803-a96703e4df5f',
  sourceCounts: { messages: 3 },
  startedAt: '2026-08-04T00:00:01.000Z',
  state: 'completed',
  targetCounts: { messages: 3 },
  updatedAt: '2026-08-04T00:01:00.000Z',
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
    mocks.requestExternalChatControl.mockResolvedValue({ runs: [remoteRun] });
    mocks.upsert.mockResolvedValue({ error: null });
  });

  it('refreshes masked bridge run state before returning local status', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/sync') as never,
      params
    );

    expect(response.status).toBe(200);
    expect(mocks.requestExternalChatControl).toHaveBeenCalledWith(
      'workspace-1',
      '/control/v1/sync/status',
      {}
    );
    expect(mocks.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          connector_key: 'opaque-connector',
          id: remoteRun.runId,
          source_counts: { messages: 3 },
          state: 'completed',
          ws_id: 'workspace-1',
        }),
      ],
      { onConflict: 'id' }
    );
  });

  it('returns the last local state when the bridge is temporarily unavailable', async () => {
    mocks.requestExternalChatControl.mockRejectedValueOnce(
      new Error('sensitive remote failure')
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/sync') as never,
      params
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ checkpoint: null, runs: [] });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      'sensitive remote failure'
    );
    warn.mockRestore();
  });
});
