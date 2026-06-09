import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const RAW_WORKSPACE_ID = 'personal';
const NORMALIZED_WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'user-1';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  createMeteredTextEmbedding: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  rpc: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/ai/embeddings/metered', () => ({
  createMeteredTextEmbedding: mocks.createMeteredTextEmbedding,
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
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

describe('workspace task semantic search route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mocks.createClient.mockResolvedValue({ id: 'session-client' });
    mocks.createAdminClient.mockResolvedValue({ rpc: mocks.rpc });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: { id: USER_ID },
    });
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
      data: [{ id: 'task-1', name: 'Deadline review' }],
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('returns 400 for malformed JSON without creating embeddings or running RPC', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      createRequest('{bad json'),
      createRouteContext()
    );

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

  it('validates defaults and searches tasks in the normalized workspace', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      createRequest(JSON.stringify({ query: '  deadline review  ' })),
      createRouteContext()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tasks: [{ id: 'task-1', name: 'Deadline review' }],
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
    });
  });
});
