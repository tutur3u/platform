import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_USER_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';

const mocks = vi.hoisted(() => {
  const adminInsert = vi.fn();
  const getEffectiveAvailableSeats = vi.fn();
  const resolveSessionAuthContext = vi.fn();
  const verifyWorkspaceMembershipType = vi.fn();
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
    resolveSessionAuthContext,
    sessionSupabase,
    verifyWorkspaceMembershipType,
  };
});

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: mocks.resolveSessionAuthContext,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/payment-core/seat-limits', () => ({
  getEffectiveAvailableSeats: mocks.getEffectiveAvailableSeats,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));

async function postBatchInvite(body: unknown) {
  const { POST } = await import(
    '@/app/api/v1/workspaces/[wsId]/members/batch-invite/route'
  );

  return POST(
    new Request(
      'http://localhost/api/v1/workspaces/workspace-1/members/batch-invite',
      {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }
    ),
    { params: Promise.resolve({ wsId: 'workspace-1' }) }
  );
}

describe('workspace members batch invite route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRON_SECRET = '';
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: mocks.sessionSupabase,
      user: { id: 'owner-1' },
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      ok: true,
      type: 'MEMBER',
    });
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
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      supabase: mocks.sessionSupabase,
      userId: 'owner-1',
      wsId: 'workspace-1',
    });
    expect(mocks.adminInsert).toHaveBeenCalledWith({
      email: 'member@example.com',
      invited_by: 'owner-1',
      ws_id: 'workspace-1',
    });
  });

  // Regression: satellite apps proxy this route to web with an app-session
  // token instead of a Supabase auth cookie.
  it('resolves the actor through app-session-aware auth', async () => {
    await postBatchInvite({ emails: ['member@example.com'] });

    expect(mocks.resolveSessionAuthContext).toHaveBeenCalledWith(
      expect.any(Request),
      { allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH }
    );
  });

  it('returns the auth failure response for unauthenticated requests', async () => {
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await postBatchInvite({ emails: ['member@example.com'] });

    expect(response.status).toBe(401);
    expect(mocks.verifyWorkspaceMembershipType).not.toHaveBeenCalled();
    expect(mocks.adminInsert).not.toHaveBeenCalled();
  });
});
