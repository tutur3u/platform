import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const canCreateInvitation = vi.fn();
  const insertInvite = vi.fn();
  const personalWorkspaceSingle = vi.fn();

  const sessionSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn((table: string) => {
      if (table === 'workspaces') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: personalWorkspaceSingle,
            }),
          }),
        };
      }

      if (table === 'workspace_email_invites') {
        return {
          insert: insertInvite,
        };
      }

      throw new Error(`Unexpected session table: ${table}`);
    }),
  };

  const adminSupabase = {
    from: vi.fn(),
  };

  return {
    adminSupabase,
    canCreateInvitation,
    insertInvite,
    personalWorkspaceSingle,
    sessionSupabase,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@/utils/seat-limits', () => ({
  canCreateInvitation: (
    ...args: Parameters<typeof mocks.canCreateInvitation>
  ) => mocks.canCreateInvitation(...args),
}));

describe('workspace members invite route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.CRON_SECRET = '';
  });

  it('checks invitation seat availability with the admin Supabase client', async () => {
    mocks.personalWorkspaceSingle.mockResolvedValue({
      data: { personal: false },
      error: null,
    });
    mocks.sessionSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mocks.canCreateInvitation.mockResolvedValue({
      allowed: true,
      status: undefined,
    });
    mocks.insertInvite.mockResolvedValue({ error: null });

    const { POST } = await import(
      '@/app/api/workspaces/[wsId]/members/invite/route'
    );
    const response = await POST(
      new Request('http://localhost/api/workspaces/ws-1/members/invite', {
        method: 'POST',
        body: JSON.stringify({ email: 'member@example.com' }),
        headers: {
          'Content-Type': 'application/json',
        },
      }),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(mocks.canCreateInvitation).toHaveBeenCalledWith(
      mocks.adminSupabase,
      'ws-1'
    );
    expect(mocks.insertInvite).toHaveBeenCalledWith({
      ws_id: 'ws-1',
      email: 'member@example.com',
      invited_by: 'user-1',
      type: 'MEMBER',
    });
  });
});
