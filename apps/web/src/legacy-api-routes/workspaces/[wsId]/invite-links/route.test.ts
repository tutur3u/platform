import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  canCreateInvitation: vi.fn(),
  createAdminClient: vi.fn(),
  insertInviteLink: vi.fn(),
  nanoid: vi.fn(),
  resolveWorkspaceRouteAccess: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: (
    ...args: Parameters<typeof mocks.resolveWorkspaceRouteAccess>
  ) => mocks.resolveWorkspaceRouteAccess(...args),
}));

vi.mock('nanoid', () => ({
  nanoid: (...args: Parameters<typeof mocks.nanoid>) => mocks.nanoid(...args),
}));

vi.mock('@tuturuuu/payment-core/seat-limits', () => ({
  canCreateInvitation: (
    ...args: Parameters<typeof mocks.canCreateInvitation>
  ) => mocks.canCreateInvitation(...args),
}));

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
const RESOLVED_WORKSPACE_ID = '00000000-0000-0000-0000-000000000011';

function createRequest(body: unknown) {
  return new Request(
    `http://localhost/api/workspaces/${WORKSPACE_ID}/invite-links`,
    { body: JSON.stringify(body), method: 'POST' }
  );
}

function createAdminSupabaseMock() {
  const inviteListQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  inviteListQuery.select = vi.fn(() => inviteListQuery);
  inviteListQuery.eq = vi.fn(() => inviteListQuery);
  inviteListQuery.order = vi.fn(async () => ({
    data: [{ code: 'existing-code', id: 'invite-link-existing' }],
    error: null,
  }));

  return {
    inviteListQuery,
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'workspaces') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((_column: string, value: string) => ({
                single: vi.fn(async () => ({
                  data: { personal: false, requestedWorkspaceId: value },
                  error: null,
                })),
              })),
            })),
          };
        }

        if (table === 'workspace_secrets') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
          };
        }

        if (table === 'workspace_invite_links') {
          return { insert: mocks.insertInviteLink };
        }

        if (table === 'workspace_invite_links_with_stats') {
          return inviteListQuery;
        }

        throw new Error(`Unexpected admin table: ${table}`);
      }),
    },
  };
}

describe('/api/workspaces/[wsId]/invite-links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: true,
      permissions: {
        membershipType: 'MEMBER',
        wsId: RESOLVED_WORKSPACE_ID,
      },
      user: { id: 'user-1' },
    });
    mocks.canCreateInvitation.mockResolvedValue({ allowed: true });
    mocks.nanoid.mockReturnValue('invite-code');
    mocks.insertInviteLink.mockReturnValue({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: { code: 'invite-code', id: 'invite-link-1' },
          error: null,
        })),
      })),
    });
  });

  it('creates links through current satellite access using the resolved workspace', async () => {
    const admin = createAdminSupabaseMock();
    mocks.createAdminClient.mockResolvedValue(admin.supabase);
    const { POST } = await import('./route');
    const request = createRequest({ memberType: 'GUEST' });

    const response = await POST(request, {
      params: Promise.resolve({ wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(201);
    expect(mocks.resolveWorkspaceRouteAccess).toHaveBeenCalledWith(
      request,
      WORKSPACE_ID,
      ['manage_workspace_members']
    );
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(mocks.insertInviteLink).toHaveBeenCalledWith({
      code: 'invite-code',
      creator_id: 'user-1',
      expires_at: undefined,
      max_uses: undefined,
      type: 'GUEST',
      ws_id: RESOLVED_WORKSPACE_ID,
    });
  });

  it('lists links through current satellite access and scopes the query', async () => {
    const admin = createAdminSupabaseMock();
    mocks.createAdminClient.mockResolvedValue(admin.supabase);
    const { GET } = await import('./route');
    const request = new Request(
      `http://localhost/api/workspaces/${WORKSPACE_ID}/invite-links`
    );

    const response = await GET(request, {
      params: Promise.resolve({ wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.resolveWorkspaceRouteAccess).toHaveBeenCalledWith(
      request,
      WORKSPACE_ID
    );
    expect(admin.inviteListQuery.eq).toHaveBeenCalledWith(
      'ws_id',
      RESOLVED_WORKSPACE_ID
    );
  });

  it('does not create a service client when workspace access is denied', async () => {
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ message: 'denied' }, { status: 403 }),
    });
    const { POST } = await import('./route');

    const response = await POST(createRequest({ memberType: 'MEMBER' }), {
      params: Promise.resolve({ wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('preserves the member-only boundary for invite-link management', async () => {
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: true,
      permissions: {
        membershipType: 'GUEST',
        wsId: RESOLVED_WORKSPACE_ID,
      },
      user: { id: 'guest-1' },
    });
    const { POST } = await import('./route');

    const response = await POST(createRequest({ memberType: 'MEMBER' }), {
      params: Promise.resolve({ wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
