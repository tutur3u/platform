import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const resolveWorkspaceRouteAccess = vi.fn();
  const adminEmailInviteMaybeSingle = vi.fn();
  const adminProfilesLimit = vi.fn();
  const adminInsertSingle = vi.fn();
  const adminUpdateSingle = vi.fn();
  const adminUpdateSelect = vi.fn(() => ({
    single: adminUpdateSingle,
  }));

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_email_invites') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              ilike: vi.fn(() => ({
                maybeSingle: adminEmailInviteMaybeSingle,
              })),
            })),
          })),
        };
      }

      if (table === 'workspace_users') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: adminInsertSingle,
            })),
          })),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              ilike: vi.fn(() => ({
                limit: adminProfilesLimit,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: adminUpdateSelect,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
  };

  return {
    adminEmailInviteMaybeSingle,
    adminInsertSingle,
    adminProfilesLimit,
    adminSupabase,
    adminUpdateSingle,
    adminUpdateSelect,
    resolveWorkspaceRouteAccess,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
}));

vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: mocks.resolveWorkspaceRouteAccess,
}));

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

function createRequest(body: unknown) {
  return new NextRequest(
    `http://localhost/api/workspaces/${WORKSPACE_ID}/members/profile`,
    {
      body: JSON.stringify(body),
      method: 'PUT',
    }
  );
}

describe('PUT /api/workspaces/[wsId]/members/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: true,
      permissions: { wsId: WORKSPACE_ID },
    });
    mocks.adminEmailInviteMaybeSingle.mockResolvedValue({
      data: { email: 'invite@example.com' },
      error: null,
    });
    mocks.adminProfilesLimit.mockResolvedValue({ data: [], error: null });
    mocks.adminInsertSingle.mockResolvedValue({
      data: {
        display_name: 'Server Alice',
        email: 'invite@example.com',
        id: 'workspace-user-1',
      },
      error: null,
    });
    mocks.adminUpdateSingle.mockResolvedValue({
      data: {
        display_name: 'Server Alice',
        email: 'invite@example.com',
        id: 'workspace-user-1',
      },
      error: null,
    });
  });

  it('creates an early workspace profile for a pending email invite', async () => {
    const { PUT } = await import('./route');

    const response = await PUT(
      createRequest({
        displayName: 'Server Alice',
        email: 'invite@example.com',
      }),
      { params: Promise.resolve({ wsId: WORKSPACE_ID }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      workspaceUser: {
        display_name: 'Server Alice',
        id: 'workspace-user-1',
      },
    });
    expect(body.workspaceUser).not.toHaveProperty('email');
    expect(mocks.adminUpdateSelect).toHaveBeenCalledWith('id, display_name');
  });

  it('rejects ambiguous matching workspace profiles for a pending email invite', async () => {
    const { PUT } = await import('./route');
    mocks.adminProfilesLimit.mockResolvedValue({
      data: [
        {
          display_name: 'First',
          email: 'invite@example.com',
          id: 'workspace-user-1',
        },
        {
          display_name: 'Second',
          email: 'invite@example.com',
          id: 'workspace-user-2',
        },
      ],
      error: null,
    });

    const response = await PUT(
      createRequest({
        displayName: 'Server Alice',
        email: 'invite@example.com',
      }),
      { params: Promise.resolve({ wsId: WORKSPACE_ID }) }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Multiple workspace profiles match this invite email',
    });
  });

  it('requires manage_workspace_members permission', async () => {
    const { PUT } = await import('./route');
    mocks.resolveWorkspaceRouteAccess.mockResolvedValue({
      ok: false,
      response: new Response(
        JSON.stringify({ message: 'Workspace permission denied' }),
        { status: 403 }
      ),
    });

    const response = await PUT(
      createRequest({
        displayName: 'Server Alice',
        email: 'invite@example.com',
      }),
      { params: Promise.resolve({ wsId: WORKSPACE_ID }) }
    );

    expect(response.status).toBe(403);
  });

  it('uses satellite-aware access resolution and its canonical workspace id', async () => {
    const { PUT } = await import('./route');

    const response = await PUT(
      createRequest({
        displayName: 'Server Alice',
        email: 'invite@example.com',
      }),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveWorkspaceRouteAccess).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'personal',
      ['manage_workspace_members']
    );
  });
});
