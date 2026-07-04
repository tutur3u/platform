import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const createClient = vi.fn();
  const normalizeWorkspaceId = vi.fn();
  const resolveAuthenticatedSessionUser = vi.fn();
  const verifyWorkspaceMembershipType = vi.fn();

  const supabase = {
    from: vi.fn(),
  };

  return {
    createClient,
    normalizeWorkspaceId,
    resolveAuthenticatedSessionUser,
    supabase,
    verifyWorkspaceMembershipType,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof mocks.resolveAuthenticatedSessionUser>
  ) => mocks.resolveAuthenticatedSessionUser(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

describe('user workspace config route payload protection', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.createClient.mockResolvedValue(mocks.supabase);
    mocks.normalizeWorkspaceId.mockResolvedValue('normalized-ws');
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'user-1' },
      authError: null,
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  });

  it('rejects PUT bodies that omit value instead of deleting the config', async () => {
    const { PUT } = await import(
      '@/legacy-api-routes/v1/users/me/workspaces/[wsId]/configs/[configId]/route'
    );

    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/users/me/workspaces/ws-1/configs/ROOT_DEFAULT_NAVIGATION',
        {
          method: 'PUT',
          body: JSON.stringify({}),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          configId: 'ROOT_DEFAULT_NAVIGATION',
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Invalid request data',
    });
    expect(mocks.supabase.from).not.toHaveBeenCalled();
  });
});
