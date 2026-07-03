import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const RAW_WORKSPACE_ID = 'personal';
const NORMALIZED_WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'user-1';

const mocks = vi.hoisted(() => {
  const sessionSupabase = { id: 'session-client' };

  return {
    createAdminClient: vi.fn(),
    createMeteredTextEmbedding: vi.fn(),
    normalizeWorkspaceId: vi.fn(),
    rpc: vi.fn(),
    serverLoggerError: vi.fn(),
    serverLoggerWarn: vi.fn(),
    sessionSupabase,
    verifyWorkspaceMembershipType: vi.fn(),
    withSessionAuth: vi.fn((handler, _options) => {
      return async (
        request: NextRequest,
        routeContext?: { params?: Promise<{ wsId: string }> | { wsId: string } }
      ) => {
        const params = routeContext?.params
          ? await Promise.resolve(routeContext.params)
          : { wsId: RAW_WORKSPACE_ID };

        return handler(
          request,
          { supabase: sessionSupabase, user: { id: USER_ID } },
          params
        );
      };
    }),
  };
});

vi.mock('@tuturuuu/ai/embeddings/metered', () => ({
  createMeteredTextEmbedding: mocks.createMeteredTextEmbedding,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: mocks.serverLoggerError,
    warn: mocks.serverLoggerWarn,
  },
}));

function createRequest(body: string) {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/${RAW_WORKSPACE_ID}/tasks/search`,
    {
      body,
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

function createRouteContext() {
  return {
    params: Promise.resolve({
      wsId: RAW_WORKSPACE_ID,
    }),
  };
}

describe('workspace task search route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.createAdminClient.mockResolvedValue({ rpc: mocks.rpc });
    mocks.normalizeWorkspaceId.mockResolvedValue(NORMALIZED_WORKSPACE_ID);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      membershipType: 'MEMBER',
      ok: true,
    });
    mocks.createMeteredTextEmbedding.mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
      ok: true,
    });
    mocks.rpc.mockResolvedValue({
      data: [{ id: 'task-1', name: 'Deadline review', similarity: 0.9 }],
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows CLI and Tasks app-session auth with read rate limiting', async () => {
    await import('./route');

    expect(mocks.withSessionAuth).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        allowAppSessionAuth: expect.objectContaining({
          targetApp: expect.arrayContaining(['tasks']),
        }),
        rateLimitKind: 'read',
      })
    );
  });

  it('returns 400 for an empty body without creating embeddings or running RPC', async () => {
    const { POST } = await import('./route');

    const response = await POST(createRequest(''), createRouteContext());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'INVALID_JSON',
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.createMeteredTextEmbedding).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns 400 for a missing query without creating embeddings or running RPC', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      createRequest(JSON.stringify({ matchCount: 20 })),
      createRouteContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'INVALID_REQUEST_BODY',
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.createMeteredTextEmbedding).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('defaults to hybrid mode and searches tasks in the normalized workspace', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      createRequest(JSON.stringify({ query: '  deadline review  ' })),
      createRouteContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tasks: [{ id: 'task-1', name: 'Deadline review', similarity: 0.9 }],
    });
    expect(mocks.createMeteredTextEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'task_search',
        userId: USER_ID,
        value: 'deadline review',
        wsId: NORMALIZED_WORKSPACE_ID,
      })
    );
    expect(mocks.rpc).toHaveBeenCalledWith('match_tasks', {
      filter_deleted: false,
      filter_ws_id: NORMALIZED_WORKSPACE_ID,
      match_count: 50,
      match_threshold: 0.3,
      query_embedding: JSON.stringify([0.1, 0.2, 0.3]),
      query_text: 'deadline review',
      search_mode: 'hybrid',
    });
  });

  it('runs text mode without creating an embedding', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      createRequest(
        JSON.stringify({
          matchCount: 20,
          matchThreshold: 0.2,
          mode: 'text',
          query: 'deadline review',
        })
      ),
      createRouteContext()
    );

    expect(response.status).toBe(200);
    expect(mocks.createMeteredTextEmbedding).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('match_tasks', {
      filter_deleted: false,
      filter_ws_id: NORMALIZED_WORKSPACE_ID,
      match_count: 20,
      match_threshold: 0.2,
      query_embedding: null,
      query_text: 'deadline review',
      search_mode: 'text',
    });
  });

  it('runs semantic mode with an embedding-only search', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      createRequest(
        JSON.stringify({
          mode: 'semantic',
          query: 'urgent bug',
        })
      ),
      createRouteContext()
    );

    expect(response.status).toBe(200);
    expect(mocks.createMeteredTextEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({
        value: expect.stringContaining(
          'urgent important high priority critical'
        ),
      })
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      'match_tasks',
      expect.objectContaining({
        query_embedding: JSON.stringify([0.1, 0.2, 0.3]),
        query_text: 'urgent bug',
        search_mode: 'semantic',
      })
    );
  });

  it('falls hybrid mode back to text search when embedding creation fails', async () => {
    mocks.createMeteredTextEmbedding.mockResolvedValueOnce({
      ok: false,
      reason: 'credits_unavailable',
    });
    const { POST } = await import('./route');

    const response = await POST(
      createRequest(
        JSON.stringify({
          mode: 'hybrid',
          query: 'deadline review',
        })
      ),
      createRouteContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: 'Task hybrid search fell back to text search',
      reason: 'credits_unavailable',
      tasks: [{ id: 'task-1', name: 'Deadline review', similarity: 0.9 }],
    });
    expect(mocks.serverLoggerWarn).toHaveBeenCalledWith(
      'Task hybrid search falling back to text search',
      expect.objectContaining({
        reason: 'credits_unavailable',
        wsId: NORMALIZED_WORKSPACE_ID,
      })
    );
    expect(mocks.rpc).toHaveBeenCalledWith('match_tasks', {
      filter_deleted: false,
      filter_ws_id: NORMALIZED_WORKSPACE_ID,
      match_count: 50,
      match_threshold: 0.3,
      query_embedding: null,
      query_text: 'deadline review',
      search_mode: 'text',
    });
  });
});
