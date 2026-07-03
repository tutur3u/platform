import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminSupabase: {},
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getWorkspaceInviteStatus: vi.fn(),
  listPendingWorkspaceInvitations: vi.fn(),
  sessionAuthGetUser: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  attachSupabaseAuthUser: (supabase: unknown) => supabase,
  createAppSessionUser: (claims: { email?: string | null; sub: string }) => ({
    email: claims.email ?? null,
    id: claims.sub,
  }),
  getAppSessionTokenFromRequest: (request: Pick<NextRequest, 'headers'>) =>
    request.headers.get('cookie')?.includes('tuturuuu_app_session=')
      ? 'app-session-token'
      : null,
  verifyAppSessionRequest: () => ({
    claims: {
      email: 'app-session@example.com',
      sub: 'app-session-user',
      target_app: 'calendar',
    },
    ok: true,
  }),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@/lib/workspace-invitations/status', () => ({
  getWorkspaceInviteStatus: (
    ...args: Parameters<typeof mocks.getWorkspaceInviteStatus>
  ) => mocks.getWorkspaceInviteStatus(...args),
  listPendingWorkspaceInvitations: (
    ...args: Parameters<typeof mocks.listPendingWorkspaceInvitations>
  ) => mocks.listPendingWorkspaceInvitations(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
  setLogDrainUserContext: vi.fn(),
}));

describe('workspace invitation API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue(mocks.adminSupabase);
    mocks.sessionAuthGetUser.mockResolvedValue({
      data: {
        user: {
          email: 'session@example.com',
          id: 'session-user',
        },
      },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: mocks.sessionAuthGetUser,
      },
    });
  });

  it('returns invite status with a Supabase session', async () => {
    mocks.getWorkspaceInviteStatus.mockResolvedValue({
      invitation: {
        createdAt: '2026-06-01T00:00:00.000Z',
        matchedEmail: null,
        source: 'direct',
        type: 'MEMBER',
        workspace: {
          avatar_url: null,
          handle: 'alpha',
          id: 'workspace-alpha',
          logo_url: null,
          name: 'Alpha',
          personal: false,
        },
      },
      status: 'pending_invite',
      workspace: {
        avatar_url: null,
        handle: 'alpha',
        id: 'workspace-alpha',
        logo_url: null,
        name: 'Alpha',
        personal: false,
      },
    });
    const { GET } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/invite-status/route'
    );

    const response = await GET(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: 'workspace-alpha' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'pending_invite',
      workspace: { id: 'workspace-alpha' },
    });
    expect(mocks.getWorkspaceInviteStatus).toHaveBeenCalledWith(
      mocks.adminSupabase,
      {
        authEmail: 'session@example.com',
        userId: 'session-user',
        workspaceId: 'workspace-alpha',
      }
    );
  });

  it('returns not found when invite status has no visible workspace', async () => {
    mocks.getWorkspaceInviteStatus.mockResolvedValue({
      status: 'none',
      workspace: null,
    });
    const { GET } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/invite-status/route'
    );

    const response = await GET(new NextRequest('http://localhost/test'), {
      params: Promise.resolve({ wsId: 'workspace-alpha' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'WORKSPACE_NOT_FOUND',
    });
  });

  it('lists invitations with app-session auth', async () => {
    mocks.listPendingWorkspaceInvitations.mockResolvedValue([
      {
        createdAt: '2026-06-01T00:00:00.000Z',
        matchedEmail: 'app-session@example.com',
        source: 'email',
        type: 'MEMBER',
        workspace: {
          avatar_url: null,
          handle: 'alpha',
          id: 'workspace-alpha',
          logo_url: null,
          name: 'Alpha',
          personal: false,
        },
      },
    ]);
    const { GET } = await import(
      '@/legacy-api-routes/workspaces/invitations/route'
    );

    const response = await GET(
      new NextRequest('http://localhost/test', {
        headers: {
          cookie: 'tuturuuu_app_session=test',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      invitations: [{ workspace: { id: 'workspace-alpha' } }],
    });
    expect(mocks.listPendingWorkspaceInvitations).toHaveBeenCalledWith(
      mocks.adminSupabase,
      {
        authEmail: 'app-session@example.com',
        userId: 'app-session-user',
      }
    );
  });
});
