import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const membershipEq = vi.fn(async () => ({ data: [], error: null }));
  const membershipSelect = vi.fn(() => ({ eq: membershipEq }));
  const requestFrom = vi.fn((table: string) => {
    if (table === 'workspace_members') {
      return { select: membershipSelect };
    }
    throw new Error(`Unexpected request table ${table}`);
  });

  const fetchMaybeSingle = vi.fn();
  const accessOr = vi.fn(() => ({ maybeSingle: fetchMaybeSingle }));
  const fetchEq = vi.fn(() => ({ or: accessOr }));
  const notificationSelect = vi.fn(() => ({ eq: fetchEq }));

  const updateMaybeSingle = vi.fn();
  const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }));
  const updateOr = vi.fn(() => ({ select: updateSelect }));
  const updateEq = vi.fn(() => ({ or: updateOr }));
  const notificationUpdate = vi.fn(() => ({ eq: updateEq }));

  const adminFrom = vi.fn((table: string) => {
    if (table === 'notifications') {
      return { select: notificationSelect, update: notificationUpdate };
    }
    throw new Error(`Unexpected admin table ${table}`);
  });
  const getUserById = vi.fn();
  const adminClient = {
    auth: { admin: { getUserById } },
    from: adminFrom,
  };

  return {
    accessOr,
    adminClient,
    fetchMaybeSingle,
    getUserById,
    requestFrom,
    updateMaybeSingle,
    withSessionAuth: vi.fn(),
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminClient)),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));

describe('notification metadata route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          email: 'Invitee@corp.com',
          email_confirmed_at: '2026-10-24T00:00:00.000Z',
        },
      },
      error: null,
    });
    mocks.fetchMaybeSingle.mockResolvedValue({
      data: {
        data: { workspace_name: 'Example' },
        id: 'notification-id',
      },
      error: null,
    });
    mocks.updateMaybeSingle.mockResolvedValue({
      data: { id: 'notification-id' },
      error: null,
    });
    mocks.withSessionAuth.mockImplementation(
      (handler: (...args: unknown[]) => unknown) =>
        async (
          request: NextRequest,
          context: { params: Promise<{ id: string }> }
        ) =>
          handler(
            request,
            {
              supabase: { from: mocks.requestFrom },
              user: { email: 'stale@corp.com', id: 'invitee-id' },
            },
            await context.params
          )
    );
  });

  it('lets an app-session invitee accept an unclaimed invite notification', async () => {
    const route = await import('./route');
    const response = await route.PATCH(
      new NextRequest(
        'http://localhost/api/v1/notifications/notification-id/metadata',
        {
          body: JSON.stringify({ action_taken: 'accepted' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PATCH',
        }
      ),
      { params: Promise.resolve({ id: 'notification-id' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { action_taken: 'accepted', workspace_name: 'Example' },
      success: true,
    });
    expect(mocks.getUserById).toHaveBeenCalledWith('invitee-id');
    expect(mocks.accessOr).toHaveBeenCalledWith(
      expect.stringContaining(
        'and(user_id.is.null,type.eq.workspace_invite,email.ilike."invitee@corp.com")'
      )
    );
  });
});
