import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  withSessionAuthOptions: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown, options: unknown) => {
    mocks.withSessionAuthOptions(options);
    return async (
      request: NextRequest,
      routeContext?: { params?: Promise<unknown> }
    ) =>
      (
        handler as (
          request: NextRequest,
          context: { user: { id: string }; supabase: object },
          params: { wsId: string }
        ) => Promise<Response>
      )(
        request,
        { user: { id: 'user-1' }, supabase: {} },
        (await routeContext?.params) as { wsId: string }
      );
  },
}));

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: (...args: unknown[]) =>
    mocks.normalizeWorkspaceId(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@tuturuuu/utils/workspace-helper')
  >()),
  verifyWorkspaceMembershipType: (...args: unknown[]) =>
    mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => {
    const workspaceQuery = {
      eq: vi.fn(() => workspaceQuery),
      maybeSingle: vi.fn(async () => ({
        data: { personal: true },
        error: null,
      })),
      select: vi.fn(() => workspaceQuery),
    };
    const settingsQuery = {
      eq: vi.fn(() => settingsQuery),
      maybeSingle: vi.fn(async () => ({
        data: { missed_entry_date_threshold: 7 },
        error: null,
      })),
      select: vi.fn(() => settingsQuery),
    };
    return {
      from: vi.fn((table: string) =>
        table === 'workspaces' ? workspaceQuery : settingsQuery
      ),
    };
  }),
}));

describe('Track workspace settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.normalizeWorkspaceId.mockResolvedValue('personal-ws');
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  });

  it('returns a disabled threshold for personal workspaces with Track auth', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new NextRequest('http://localhost/api/v1/workspaces/personal/settings'),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      missed_entry_date_threshold: null,
    });
    expect(mocks.withSessionAuthOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        allowAppSessionAuth: { targetApp: 'track' },
      })
    );
  });
});
