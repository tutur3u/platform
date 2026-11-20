import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  createClient: vi.fn(),
  getPermissions: vi.fn(),
  resolveActor: vi.fn(),
  syncGuestGroups: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: vi.fn(),
}));
vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveActor,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
  createClient: mocks.createClient,
}));
vi.mock('@tuturuuu/users-core/lib/user-groups/guest-membership', () => ({
  syncWorkspaceUserGuestMembership: mocks.syncGuestGroups,
}));
vi.mock('@tuturuuu/utils/user-helper', () => ({
  getCurrentWorkspaceUser: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));
vi.mock('@/lib/post-email-queue', () => ({
  cancelPendingPostEmailsForWorkspaceUser: vi.fn(),
  isWorkspaceUserInactiveForPostEmail: () => false,
  POST_EMAIL_INACTIVE_RECIPIENT_REASON: 'Inactive',
}));
vi.mock('@/lib/workspace-api-key', () => ({
  validateWorkspaceApiKey: vi.fn(),
}));

import { PUT } from './route';

const actor = { id: 'verified-platform-user' };
const wsId = 'workspace';
const userId = 'contact';
const contact = { archived: false, archived_until: null, id: userId };
const client = {};
const database = {
  from: () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          single: async () => ({ data: contact, error: null }),
        }),
      }),
    }),
  }),
  rpc: mocks.update,
};

function put(body: object) {
  return PUT(
    new Request(
      `https://tuturuuu.com/api/v1/workspaces/${wsId}/users/${userId}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      }
    ),
    { params: Promise.resolve({ wsId, userId }) }
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createClient.mockResolvedValue(client);
  mocks.resolveActor.mockResolvedValue({ user: actor });
  mocks.getPermissions.mockResolvedValue({ containsPermission: () => true });
  mocks.admin.mockResolvedValue(database);
  mocks.update.mockResolvedValue({ data: contact, error: null });
});

it('uses one verified actor for Contacts permissions, audit, and guest enrollment', async () => {
  const response = await put({ display_name: 'Contact', is_guest: true });
  expect(response.status).toBe(200);
  expect(mocks.resolveActor).toHaveBeenCalledExactlyOnceWith(client);
  expect(mocks.getPermissions).toHaveBeenCalledWith({ user: actor, wsId });
  expect(mocks.update).toHaveBeenCalledWith(
    'admin_update_workspace_user_with_audit_actor',
    expect.objectContaining({ p_actor_auth_uid: actor.id })
  );
  expect(mocks.syncGuestGroups).toHaveBeenCalledExactlyOnceWith({
    actorId: actor.id,
    isGuest: true,
    sbAdmin: database,
    userId,
    wsId,
  });
});

it('keeps ordinary contact writes independent of guest membership', async () => {
  expect((await put({ display_name: 'Revised contact' })).status).toBe(200);
  expect(mocks.update).toHaveBeenCalled();
  expect(mocks.syncGuestGroups).not.toHaveBeenCalled();
});

it('denies requests without a current session before a service-role write', async () => {
  mocks.resolveActor.mockResolvedValue({ user: null });
  expect((await put({ is_guest: true })).status).toBe(404);
  expect(mocks.getPermissions).not.toHaveBeenCalled();
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.syncGuestGroups).not.toHaveBeenCalled();
});
