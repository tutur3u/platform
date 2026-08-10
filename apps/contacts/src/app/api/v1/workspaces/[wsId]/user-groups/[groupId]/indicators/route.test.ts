import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ACTOR_AUTH_UID = '44444444-4444-4444-8444-444444444444';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const METRIC_ID = '33333333-3333-4333-8333-333333333333';
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => {
  const createAdminClient = vi.fn();
  const getUserGroupRoutePermissions = vi.fn();
  const privateRpc = vi.fn();
  const resolveRequestActorAuthUid = vi.fn();
  const resolveUserGroupRouteWorkspaceId = vi.fn();
  const withoutPermission = vi.fn();

  const adminSupabase = {
    schema: vi.fn(() => ({
      rpc: privateRpc,
    })),
  };

  return {
    adminSupabase,
    createAdminClient,
    getUserGroupRoutePermissions,
    privateRpc,
    resolveRequestActorAuthUid,
    resolveUserGroupRouteWorkspaceId,
    withoutPermission,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/users-core/lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.getUserGroupRoutePermissions,
}));

vi.mock('@tuturuuu/users-core/lib/user-groups/route-helpers', () => ({
  resolveRequestActorAuthUid: mocks.resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId: mocks.resolveUserGroupRouteWorkspaceId,
}));

function request(values: unknown) {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/user-groups/${GROUP_ID}/indicators`,
    {
      body: JSON.stringify(values),
      method: 'PATCH',
    }
  );
}

function params() {
  return {
    params: Promise.resolve({
      groupId: GROUP_ID,
      wsId: WORKSPACE_ID,
    }),
  };
}

describe('Contacts group indicator PATCH re-export', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getUserGroupRoutePermissions.mockResolvedValue({
      withoutPermission: mocks.withoutPermission,
    });
    mocks.withoutPermission.mockReturnValue(false);
    mocks.resolveUserGroupRouteWorkspaceId.mockResolvedValue(WORKSPACE_ID);
    mocks.resolveRequestActorAuthUid.mockResolvedValue(ACTOR_AUTH_UID);
    mocks.createAdminClient.mockResolvedValue(mocks.adminSupabase);
    mocks.privateRpc.mockResolvedValue({ data: null, error: null });
  });

  it('denies callers without score-update permission', async () => {
    mocks.withoutPermission.mockReturnValue(true);
    const { PATCH } = await import('./route.js');

    const response = await PATCH(request([]), params());

    expect(response.status).toBe(403);
    expect(mocks.withoutPermission).toHaveBeenCalledWith(
      'update_user_groups_scores'
    );
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.privateRpc).not.toHaveBeenCalled();
  });

  it('allows authorized callers through the shared handler', async () => {
    const values = [
      {
        indicator_id: METRIC_ID,
        user_id: ACTOR_AUTH_UID,
        value: 72,
      },
    ];
    const { PATCH } = await import('./route.js');

    const response = await PATCH(request(values), params());

    expect(response.status).toBe(200);
    expect(mocks.privateRpc).toHaveBeenCalledWith(
      'admin_upsert_user_indicator_values_with_audit_actor',
      {
        p_actor_auth_uid: ACTOR_AUTH_UID,
        p_group_id: GROUP_ID,
        p_values: values,
        p_ws_id: WORKSPACE_ID,
      }
    );
  });
});
