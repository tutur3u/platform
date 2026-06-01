import { beforeEach, describe, expect, it, vi } from 'vitest';

const NORMALIZED_WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const RAW_WORKSPACE_ID = 'paid-workspace';
const USER_ID = 'user-1';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  createMeteredTextEmbedding: vi.fn(),
  getWorkspaceTier: vi.fn(),
  isFeatureAvailable: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
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

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();

  return {
    ...actual,
    getWorkspaceTier: mocks.getWorkspaceTier,
    normalizeWorkspaceId: mocks.normalizeWorkspaceId,
    verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
  };
});

vi.mock('@/lib/feature-tiers', () => ({
  isFeatureAvailable: mocks.isFeatureAvailable,
}));

function createSearchRequest() {
  return new Request('http://localhost/api/v1/live/tools/execute', {
    body: JSON.stringify({
      args: { matchCount: 5, query: 'deadline review' },
      functionName: 'search_tasks',
      wsId: RAW_WORKSPACE_ID,
    }),
    method: 'POST',
  });
}

describe('live tools execute route workspace authorization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mocks.createClient.mockResolvedValue({
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            completed: false,
            description: null,
            id: 'task-1',
            name: 'Deadline review',
            priority: 'high',
            similarity: 0.92,
          },
        ],
        error: null,
      }),
    });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: { id: USER_ID },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue(NORMALIZED_WORKSPACE_ID);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      membershipType: 'MEMBER',
      ok: true,
    });
    mocks.getWorkspaceTier.mockResolvedValue('PRO');
    mocks.isFeatureAvailable.mockReturnValue(true);
    mocks.createMeteredTextEmbedding.mockResolvedValue({
      embedding: [0.1, 0.2, 0.3],
      ok: true,
    });
  });

  it('rejects non-members before checking tier or reserving embedding credits', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValueOnce({
      error: 'membership_missing',
      ok: false,
    });

    const { POST } = await import('./route');
    const response = await POST(createSearchRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'You are not a member of this workspace',
    });
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      userId: USER_ID,
      wsId: NORMALIZED_WORKSPACE_ID,
    });
    expect(mocks.getWorkspaceTier).not.toHaveBeenCalled();
    expect(mocks.createMeteredTextEmbedding).not.toHaveBeenCalled();
  });

  it('charges the normalized workspace only after membership and tier checks pass', async () => {
    const { POST } = await import('./route');
    const response = await POST(createSearchRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: {
        count: 1,
        tasks: [
          {
            completed: false,
            description: null,
            id: 'task-1',
            name: 'Deadline review',
            priority: 'high',
            similarity: 0.92,
          },
        ],
      },
    });
    expect(mocks.getWorkspaceTier).toHaveBeenCalledWith(
      NORMALIZED_WORKSPACE_ID,
      { useAdmin: true }
    );
    expect(mocks.createMeteredTextEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'task_search',
        userId: USER_ID,
        wsId: NORMALIZED_WORKSPACE_ID,
      })
    );
  });
});
