import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const adminSchema = vi.fn();
  const getPermissions = vi.fn();
  const normalizeWorkspaceId = vi.fn();
  const resolveSessionAuthContext = vi.fn();
  const verifyWorkspaceMembershipType = vi.fn();

  const adminSupabase = {
    schema: adminSchema,
  };
  const sessionSupabase = {};
  const storageClient = {
    storage: {
      from: vi.fn(),
    },
  };

  return {
    adminSchema,
    adminSupabase,
    getPermissions,
    normalizeWorkspaceId,
    resolveSessionAuthContext,
    sessionSupabase,
    storageClient,
    verifyWorkspaceMembershipType,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
  createDynamicClient: vi.fn(() => Promise.resolve(mocks.storageClient)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: (
    ...args: Parameters<typeof mocks.resolveSessionAuthContext>
  ) => mocks.resolveSessionAuthContext(...args),
}));

vi.mock('@/lib/workspace-helper', () => ({
  getWorkspaceConfig: vi.fn(),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

describe('time tracking requests route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-1');
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: mocks.sessionSupabase,
      user: { id: 'user-1' },
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn(() => false),
    });
  });

  it('rejects malformed requestId filters before Supabase UUID comparisons', async () => {
    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/time-tracking/requests/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/time-tracking/requests?requestId=not-a-uuid'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    await expect(response.json()).resolves.toEqual({
      error: 'Invalid request ID',
    });
    expect(response.status).toBe(400);
    expect(mocks.adminSchema).not.toHaveBeenCalled();
  });
});
