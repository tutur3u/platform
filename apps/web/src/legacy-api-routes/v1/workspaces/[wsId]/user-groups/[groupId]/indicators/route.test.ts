import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ACTOR_AUTH_UID = '44444444-4444-4444-8444-444444444444';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const METRIC_ID = '33333333-3333-4333-8333-333333333333';
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => {
  const containsPermission = vi.fn(() => true);
  const privateRpc = vi.fn();
  const serverLoggerError = vi.fn();
  const withoutPermission = vi.fn(() => false);

  const adminSupabase = {
    schema: vi.fn(() => ({
      rpc: privateRpc,
    })),
  };

  return {
    adminSupabase,
    containsPermission,
    privateRpc,
    serverLoggerError,
    withoutPermission,
  };
});

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();
  return {
    ...actual,
    getPermissions: vi.fn(async () => ({
      containsPermission: mocks.containsPermission,
      withoutPermission: mocks.withoutPermission,
    })),
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: mocks.serverLoggerError,
  },
}));

vi.mock('@tuturuuu/users-core/lib/user-groups/route-helpers', () => ({
  resolveRequestActorAuthUid: vi.fn(async () => ACTOR_AUTH_UID),
  resolveUserGroupRouteWorkspaceId: vi.fn(async () => WORKSPACE_ID),
}));

describe('user group indicators route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.containsPermission.mockReturnValue(true);
    mocks.withoutPermission.mockReturnValue(false);
    mocks.privateRpc.mockResolvedValue({
      data: {
        factor: 1,
        group_id: GROUP_ID,
        id: METRIC_ID,
        is_weighted: true,
        name: 'Quiz score',
        unit: 'points',
        ws_id: WORKSPACE_ID,
      },
      error: null,
    });
  });

  it('creates metrics through the actor-aware audit RPC', async () => {
    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/user-groups/[groupId]/indicators/route'
    );

    const response = await POST(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/user-groups/${GROUP_ID}/indicators`,
        {
          body: JSON.stringify({
            categoryIds: ['55555555-5555-4555-8555-555555555555'],
            factor: 1,
            isWeighted: true,
            name: 'Quiz score',
            unit: 'points',
          }),
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          groupId: GROUP_ID,
          wsId: WORKSPACE_ID,
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.privateRpc).toHaveBeenCalledWith(
      'admin_create_user_group_metric_with_audit_actor',
      {
        p_actor_auth_uid: ACTOR_AUTH_UID,
        p_category_ids: ['55555555-5555-4555-8555-555555555555'],
        p_group_id: GROUP_ID,
        p_payload: {
          factor: 1,
          is_weighted: true,
          name: 'Quiz score',
          unit: 'points',
        },
        p_ws_id: WORKSPACE_ID,
      }
    );
  });

  it('denies PATCH without score-update permission before privileged work', async () => {
    mocks.withoutPermission.mockReturnValue(true);
    const { PATCH } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/user-groups/[groupId]/indicators/route'
    );

    const response = await PATCH(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/user-groups/${GROUP_ID}/indicators`,
        {
          body: JSON.stringify([]),
          method: 'PATCH',
        }
      ),
      {
        params: Promise.resolve({
          groupId: GROUP_ID,
          wsId: WORKSPACE_ID,
        }),
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.withoutPermission).toHaveBeenCalledWith(
      'update_user_groups_scores'
    );
    expect(mocks.privateRpc).not.toHaveBeenCalled();
  });

  it('allows authorized PATCH through the live Web re-export', async () => {
    const values = [
      {
        indicator_id: METRIC_ID,
        user_id: ACTOR_AUTH_UID,
        value: 88,
      },
    ];
    const { PATCH } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/user-groups/[groupId]/indicators/route'
    );

    const response = await PATCH(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/user-groups/${GROUP_ID}/indicators`,
        {
          body: JSON.stringify(values),
          method: 'PATCH',
        }
      ),
      {
        params: Promise.resolve({
          groupId: GROUP_ID,
          wsId: WORKSPACE_ID,
        }),
      }
    );

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
