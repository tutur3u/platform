import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const adminInsert = vi.fn();
  const getEffectiveAvailableSeats = vi.fn();
  const resolveWorkspaceRouteAccess = vi.fn();
  const workspaceMaybeSingle = vi.fn();
  const secretMaybeSingle = vi.fn();
  const progressMaybeSingle = vi.fn();
  const progressUpsert = vi.fn();

  const sessionSupabase = {
    from: vi.fn((table: string) => {
      if (table !== 'onboarding_progress') {
        throw new Error(`Unexpected session table: ${table}`);
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: progressMaybeSingle })),
        })),
        upsert: progressUpsert,
      };
    }),
  };
  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspaces') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: workspaceMaybeSingle })),
          })),
        };
      }
      if (table === 'workspace_secrets') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: secretMaybeSingle })),
            })),
          })),
        };
      }
      if (table !== 'workspace_email_invites') {
        throw new Error(`Unexpected admin table: ${table}`);
      }
      return { insert: adminInsert };
    }),
  };

  return {
    adminInsert,
    adminSupabase,
    getEffectiveAvailableSeats,
    progressMaybeSingle,
    progressUpsert,
    resolveWorkspaceRouteAccess,
    secretMaybeSingle,
    sessionSupabase,
    workspaceMaybeSingle,
  };
});

vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: mocks.resolveWorkspaceRouteAccess,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/payment-core/seat-limits', () => ({
  getEffectiveAvailableSeats: mocks.getEffectiveAvailableSeats,
}));

function routeAccess({
  membershipType = 'MEMBER',
  permitted = true,
  wsId = 'workspace-1',
}: {
  membershipType?: string;
  permitted?: boolean;
  wsId?: string;
} = {}) {
  return {
    ok: true,
    permissions: {
      membershipType,
      wsId,
      withoutPermission: () => !permitted,
    },
    supabase: mocks.sessionSupabase,
    user: { id: 'owner-1' },
  };
}

async function postBatchInvite(body: unknown, wsId = 'workspace-1') {
  const { POST } = await import(
    '@/app/api/v1/workspaces/[wsId]/members/batch-invite/route'
  );

  return POST(
    new Request(
      `http://localhost/api/v1/workspaces/${wsId}/members/batch-invite`,
      {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }
    ),
    { params: Promise.resolve({ wsId }) }
  );
}

describe('workspace members batch invite route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRON_SECRET = '';
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue(routeAccess());
    mocks.workspaceMaybeSingle.mockResolvedValue({
      data: { personal: false },
      error: null,
    });
    mocks.secretMaybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.getEffectiveAvailableSeats.mockResolvedValue({
      effectiveAvailable: 10,
      status: { isSeatBased: false, seatCount: 0 },
    });
    mocks.adminInsert.mockResolvedValue({ error: null });
    mocks.progressMaybeSingle.mockResolvedValue({
      data: { invited_emails: [] },
      error: null,
    });
    mocks.progressUpsert.mockResolvedValue({ error: null });
  });

  it('writes normalized invitations with the admin client after membership validation', async () => {
    const response = await postBatchInvite({
      emails: ['Member@Example.com', 'member@example.com'],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      successCount: 1,
      totalRequested: 1,
    });
    expect(mocks.adminInsert).toHaveBeenCalledWith({
      email: 'member@example.com',
      invited_by: 'owner-1',
      ws_id: 'workspace-1',
    });
  });

  // Regression: satellite apps proxy this route to web with an app-session
  // token instead of a Supabase auth cookie.
  it('resolves workspace access through app-session-aware route access', async () => {
    await postBatchInvite({ emails: ['member@example.com'] });

    expect(mocks.resolveWorkspaceRouteAccess).toHaveBeenCalledWith(
      expect.any(Request),
      'workspace-1'
    );
  });

  it('writes invites under the resolved permissions.wsId, not the raw route id', async () => {
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue(
      routeAccess({ wsId: 'personal-ws-id' })
    );

    const response = await postBatchInvite(
      { emails: ['member@example.com'] },
      'personal'
    );

    expect(mocks.resolveWorkspaceRouteAccess).toHaveBeenCalledWith(
      expect.any(Request),
      'personal'
    );
    expect(response.status).toBe(200);
    expect(mocks.adminInsert).toHaveBeenCalledWith({
      email: 'member@example.com',
      invited_by: 'owner-1',
      ws_id: 'personal-ws-id',
    });
  });

  it('returns the auth failure response for unauthenticated requests', async () => {
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await postBatchInvite({ emails: ['member@example.com'] });

    expect(response.status).toBe(401);
    expect(mocks.adminInsert).not.toHaveBeenCalled();
  });

  it('rejects callers without member management permission', async () => {
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue(
      routeAccess({ permitted: false })
    );

    const response = await postBatchInvite({ emails: ['member@example.com'] });

    expect(response.status).toBe(403);
    expect(mocks.adminInsert).not.toHaveBeenCalled();
  });

  it('rejects guest memberships', async () => {
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue(
      routeAccess({ membershipType: 'GUEST' })
    );

    const response = await postBatchInvite({ emails: ['member@example.com'] });

    expect(response.status).toBe(403);
    expect(mocks.adminInsert).not.toHaveBeenCalled();
  });

  it('blocks batch invitations to personal workspaces', async () => {
    mocks.workspaceMaybeSingle.mockResolvedValue({
      data: { personal: true },
      error: null,
    });

    const response = await postBatchInvite({ emails: ['member@example.com'] });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Cannot invite members to a personal workspace.',
    });
    expect(mocks.adminInsert).not.toHaveBeenCalled();
  });

  it('fails closed when the personal workspace lookup errors', async () => {
    mocks.workspaceMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });

    const response = await postBatchInvite({ emails: ['member@example.com'] });

    expect(response.status).toBe(500);
    expect(mocks.adminInsert).not.toHaveBeenCalled();
  });

  it('honors the workspace invitation stop setting', async () => {
    mocks.secretMaybeSingle.mockResolvedValue({
      data: { value: 'true' },
      error: null,
    });

    const response = await postBatchInvite({ emails: ['member@example.com'] });

    expect(response.status).toBe(403);
    expect(mocks.adminInsert).not.toHaveBeenCalled();
  });
});
