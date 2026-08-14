import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(),
  maybeSingle: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  upsert: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: unknown) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<unknown> }
    ) =>
      (
        handler as (
          request: NextRequest,
          context: { user: { id: string }; supabase: object },
          params: { configId: string; wsId: string }
        ) => Promise<Response>
      )(
        request,
        { user: { id: 'user-1' }, supabase: {} },
        (await routeContext?.params) as { configId: string; wsId: string }
      ),
}));

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: (...args: unknown[]) =>
    mocks.normalizeWorkspaceId(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@tuturuuu/utils/workspace-helper')
  >()),
  getPermissions: (...args: unknown[]) => mocks.getPermissions(...args),
  verifyWorkspaceMembershipType: (...args: unknown[]) =>
    mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => {
    const query = {
      eq: vi.fn(() => query),
      maybeSingle: mocks.maybeSingle,
      select: vi.fn(() => query),
      upsert: mocks.upsert,
    };
    return { from: vi.fn(() => query) };
  }),
}));

describe('Track time tracking config route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-1');
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
    mocks.maybeSingle.mockResolvedValue({
      data: { value: 'true' },
      error: null,
    });
    mocks.upsert.mockResolvedValue({ error: null });
  });

  it('reads the Track-owned future-session config', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/settings/ALLOW_FUTURE_SESSIONS'
      ),
      {
        params: Promise.resolve({
          configId: 'ALLOW_FUTURE_SESSIONS',
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ value: 'true' });
  });

  it('rejects non-boolean config writes', async () => {
    const { PUT } = await import('./route');
    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/settings/ALLOW_FUTURE_SESSIONS',
        {
          body: JSON.stringify({ value: 'sometimes' }),
          headers: { 'content-type': 'application/json' },
          method: 'PUT',
        }
      ),
      {
        params: Promise.resolve({
          configId: 'ALLOW_FUTURE_SESSIONS',
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
