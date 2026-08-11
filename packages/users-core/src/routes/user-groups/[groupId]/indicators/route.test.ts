import { beforeEach, describe, expect, it, vi } from 'vitest';

const ACTOR_AUTH_UID = '44444444-4444-4444-8444-444444444444';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const METRIC_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '55555555-5555-4555-8555-555555555555';
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

function requestWithPayload(payload: unknown) {
  return {
    json: vi.fn(async () => payload),
  } as unknown as Request;
}

function params() {
  return {
    params: Promise.resolve({
      groupId: GROUP_ID,
      wsId: WORKSPACE_ID,
    }),
  };
}

async function patch(request: Request) {
  const { PATCH } = await import('./route.js');
  return PATCH(request, params());
}

describe('group indicator PATCH authorization', () => {
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

  it('returns 404 without a permission context and performs no privileged work', async () => {
    mocks.getUserGroupRoutePermissions.mockResolvedValue(null);
    const request = requestWithPayload([]);

    const response = await patch(request);

    expect(response.status).toBe(404);
    expect(mocks.withoutPermission).not.toHaveBeenCalled();
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.resolveRequestActorAuthUid).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.privateRpc).not.toHaveBeenCalled();
  });

  it('requires update_user_groups_scores before parsing or privileged work', async () => {
    mocks.withoutPermission.mockReturnValue(true);
    const request = requestWithPayload([]);

    const response = await patch(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Insufficient permissions to manage indicators',
    });
    expect(mocks.withoutPermission).toHaveBeenCalledWith(
      'update_user_groups_scores'
    );
    expect(request.json).not.toHaveBeenCalled();
    expect(mocks.resolveRequestActorAuthUid).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.privateRpc).not.toHaveBeenCalled();
  });

  it('rejects a non-array payload for an authorized actor', async () => {
    const request = requestWithPayload({ value: 10 });

    const response = await patch(request);

    expect(response.status).toBe(400);
    expect(mocks.withoutPermission).toHaveBeenCalledWith(
      'update_user_groups_scores'
    );
    expect(request.json).toHaveBeenCalledOnce();
    expect(mocks.resolveRequestActorAuthUid).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.privateRpc).not.toHaveBeenCalled();
  });

  it('updates nullable and numeric values with actor attribution', async () => {
    const values = [
      { indicator_id: METRIC_ID, user_id: USER_ID, value: 93.5 },
      { indicator_id: METRIC_ID, user_id: ACTOR_AUTH_UID, value: null },
    ];
    const request = requestWithPayload(values);

    const response = await patch(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(mocks.createAdminClient).toHaveBeenCalledOnce();
    expect(mocks.resolveRequestActorAuthUid).toHaveBeenCalledWith(request);
    expect(mocks.adminSupabase.schema).toHaveBeenCalledWith('private');
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

  it('returns 500 when the privileged RPC fails', async () => {
    mocks.privateRpc.mockResolvedValue({
      data: null,
      error: { message: 'rpc failed' },
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const response = await patch(requestWithPayload([]));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Error updating indicator values',
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
