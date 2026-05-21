import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchWorkspaceSummaries: vi.fn(),
  serverLoggerError: vi.fn(),
  supabase: { from: vi.fn() },
  user: { id: 'user-1' },
  withSessionAuth: vi.fn(),
}));

vi.mock('@tuturuuu/ui/lib/workspace-actions', () => ({
  fetchWorkspaceSummaries: mocks.fetchWorkspaceSummaries,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: mocks.serverLoggerError,
  },
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));

describe('workspace API route app-session bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.fetchWorkspaceSummaries.mockResolvedValue([{ id: 'workspace-1' }]);
    mocks.withSessionAuth.mockImplementation(
      (
        handler: (
          request: NextRequest,
          context: { supabase: typeof mocks.supabase; user: typeof mocks.user }
        ) => unknown
      ) =>
        (request: NextRequest) =>
          handler(request, { supabase: mocks.supabase, user: mocks.user })
    );
  });

  it('allows internal app-session auth on the workspace list route', async () => {
    await import('@/app/api/v1/workspaces/route');

    expect(mocks.withSessionAuth).toHaveBeenCalledWith(expect.any(Function), {
      allowAppSessionAuth: {
        targetApp: [
          'calendar',
          'cms',
          'drive',
          'finance',
          'hive',
          'inventory',
          'learn',
          'mind',
          'mira',
          'nova',
          'rewise',
          'tasks',
          'teach',
          'track',
          'platform',
        ],
      },
      cache: { maxAge: 60, swr: 30 },
    });
  });

  it('passes authenticated context into the workspace summary loader', async () => {
    const route = await import('@/app/api/v1/workspaces/route');
    const request = new NextRequest('http://localhost/api/v1/workspaces');
    const response = await route.GET(request);

    expect(response.status).toBe(200);
    expect(mocks.fetchWorkspaceSummaries).toHaveBeenCalledWith({
      request,
      requireAuth: true,
      supabase: mocks.supabase,
      userId: 'user-1',
    });
  });

  it('allows internal app-session auth on the legacy workspace detail route', async () => {
    await import('@/app/api/workspaces/[wsId]/route');

    expect(mocks.withSessionAuth).toHaveBeenCalledWith(expect.any(Function), {
      allowAppSessionAuth: {
        targetApp: [
          'calendar',
          'cms',
          'drive',
          'finance',
          'hive',
          'inventory',
          'learn',
          'mind',
          'mira',
          'nova',
          'rewise',
          'tasks',
          'teach',
          'track',
          'platform',
        ],
      },
      cache: { maxAge: 60, swr: 30 },
    });
  });
});
