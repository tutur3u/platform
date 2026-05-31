import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  createMeteredTextEmbedding: vi.fn(),
  getWorkspaceTier: vi.fn(),
  isFeatureAvailable: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/ai/embeddings/metered', () => ({
  createMeteredTextEmbedding: (
    ...args: Parameters<typeof mocks.createMeteredTextEmbedding>
  ) => mocks.createMeteredTextEmbedding(...args),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof mocks.resolveAuthenticatedSessionUser>
  ) => mocks.resolveAuthenticatedSessionUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceTier: (...args: Parameters<typeof mocks.getWorkspaceTier>) =>
    mocks.getWorkspaceTier(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/feature-tiers', () => ({
  isFeatureAvailable: (...args: Parameters<typeof mocks.isFeatureAvailable>) =>
    mocks.isFeatureAvailable(...args),
}));

import { POST } from './route';

function postRequest(body: unknown) {
  return new Request('http://localhost/api/v1/live/tools/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('live tools execute route', () => {
  const requestSupabase = { auth: {}, from: vi.fn(), rpc: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue(requestSupabase);
    mocks.createAdminClient.mockResolvedValue({ from: vi.fn(), rpc: vi.fn() });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com' },
      authError: null,
    });
    mocks.normalizeWorkspaceId.mockResolvedValue('workspace-1');
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.getWorkspaceTier.mockResolvedValue('PRO');
    mocks.isFeatureAvailable.mockReturnValue(true);
    mocks.createMeteredTextEmbedding.mockResolvedValue({
      ok: false,
      reason: 'credits_exhausted',
    });
  });

  it('rejects search_tasks before metered embedding when workspace membership is missing', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValueOnce({
      ok: false,
      error: 'membership_missing',
    });

    const request = postRequest({
      wsId: 'victim-workspace',
      functionName: 'search_tasks',
      args: { query: 'roadmap' },
    });
    const response = await POST(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'You are not a member of this workspace',
    });
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'victim-workspace',
      requestSupabase
    );
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      wsId: 'workspace-1',
      userId: 'user-1',
      supabase: requestSupabase,
    });
    expect(mocks.getWorkspaceTier).not.toHaveBeenCalled();
    expect(mocks.createMeteredTextEmbedding).not.toHaveBeenCalled();
  });

  it('allows a workspace member to execute search_tasks with the normalized billing scope', async () => {
    const request = postRequest({
      wsId: 'member-workspace',
      functionName: 'search_tasks',
      args: { query: 'roadmap', matchCount: 20 },
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result: {
        count: 0,
        skipped: true,
        reason: 'credits_exhausted',
        tasks: [],
      },
    });
    expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
      'member-workspace',
      requestSupabase
    );
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      wsId: 'workspace-1',
      userId: 'user-1',
      supabase: requestSupabase,
    });
    expect(mocks.createMeteredTextEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'task_search',
        userId: 'user-1',
        wsId: 'workspace-1',
      })
    );
  });
});
