import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = {
  auth: {
    supabase: null as unknown,
    user: { id: 'user-1' },
  },
  getChatRealtimeSubscribeUrl: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  serverError: vi.fn(),
};

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown, params: unknown) => Response) =>
    async (request: Request, routeContext?: { params?: Promise<unknown> }) =>
      handler(request, mocks.auth, await routeContext?.params),
}));

vi.mock('@/lib/chat/private-rpc', () => ({
  resolveChatRouteContext: (
    ...args: Parameters<typeof mocks.resolveChatRouteContext>
  ) => mocks.resolveChatRouteContext(...args),
}));

vi.mock('@/lib/chat/realtime', () => ({
  getChatRealtimeSubscribeUrl: (
    ...args: Parameters<typeof mocks.getChatRealtimeSubscribeUrl>
  ) => mocks.getChatRealtimeSubscribeUrl(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverError>) =>
      mocks.serverError(...args),
  },
}));

function createRequest() {
  return new Request(
    'http://localhost/api/v1/workspaces/workspace-1/chat/realtime',
    {
      method: 'GET',
    }
  );
}

function createRouteContext() {
  return {
    params: Promise.resolve({
      wsId: 'workspace-1',
    }),
  };
}

describe('chat realtime route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveChatRouteContext.mockResolvedValue({
      context: { normalizedWsId: 'workspace-1' },
      ok: true,
    });
    mocks.getChatRealtimeSubscribeUrl.mockReturnValue({
      expiresAt: new Date('2026-06-01T08:05:00.000Z'),
      url: new URL('https://chat-realtime.local/subscribe?token=test'),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns successful SSE headers and proxies upstream events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('event: message\ndata: {"type":"ready"}\n\n', {
            headers: { 'Content-Type': 'text/event-stream' },
            status: 200,
          })
      )
    );

    const { GET } = await import('./route');
    const response = await GET(createRequest() as never, createRouteContext());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.text()).resolves.toContain('"type":"ready"');
  });

  it('converts upstream 400 responses into an SSE error event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad subscribe', { status: 400 }))
    );

    const { GET } = await import('./route');
    const response = await GET(createRequest() as never, createRouteContext());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    await expect(response.text()).resolves.toContain('realtime_unavailable');
    expect(mocks.serverError).toHaveBeenCalledWith(
      'Chat realtime upstream unavailable',
      expect.objectContaining({ status: 400, wsId: 'workspace-1' })
    );
  });

  it('converts subscribe URL setup failures into an SSE error event', async () => {
    mocks.getChatRealtimeSubscribeUrl.mockImplementationOnce(() => {
      throw new Error('signing failed');
    });

    const { GET } = await import('./route');
    const response = await GET(createRequest() as never, createRouteContext());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    await expect(response.text()).resolves.toContain('realtime_unavailable');
    expect(mocks.serverError).toHaveBeenCalledWith(
      'Chat realtime subscribe URL failed',
      expect.objectContaining({ wsId: 'workspace-1' })
    );
  });
});
