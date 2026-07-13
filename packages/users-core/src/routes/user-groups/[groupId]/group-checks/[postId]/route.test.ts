import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  deleteRows: vi.fn(),
  getExistingStates: vi.fn(),
  getPermissions: vi.fn(),
  hasPost: vi.fn(),
  inUsers: vi.fn(),
  recordChanges: vi.fn(),
  resolveActor: vi.fn(),
  resolveWorkspaceId: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('../../../../../lib/post-check-audit', () => ({
  getExistingPostCheckStates: mocks.getExistingStates,
  recordPostCheckChanges: mocks.recordChanges,
}));

vi.mock('../../../../../lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.getPermissions,
}));

vi.mock('../../../../../lib/user-groups/route-helpers', () => ({
  hasUserGroupPostInWorkspace: mocks.hasPost,
  resolveRequestActorAuthUid: mocks.resolveActor,
  resolveUserGroupRouteWorkspaceId: mocks.resolveWorkspaceId,
}));

import { DELETE, PUT } from './route';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const POST_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_ID = '55555555-5555-4555-8555-555555555555';
const context = {
  params: Promise.resolve({
    groupId: GROUP_ID,
    postId: POST_ID,
    wsId: WORKSPACE_ID,
  }),
};

describe('shared group-check item route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inUsers.mockResolvedValue({ error: null });
    mocks.deleteRows.mockReturnValue({
      eq: vi.fn(() => ({ in: mocks.inUsers })),
    });
    mocks.createAdminClient.mockResolvedValue({
      schema: vi.fn(() => ({
        from: vi.fn(() => ({
          delete: mocks.deleteRows,
          upsert: mocks.upsert,
        })),
      })),
    });
    mocks.getExistingStates.mockResolvedValue(new Map([[USER_ID, false]]));
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
    mocks.hasPost.mockResolvedValue(true);
    mocks.recordChanges.mockResolvedValue(undefined);
    mocks.resolveActor.mockResolvedValue(ACTOR_ID);
    mocks.resolveWorkspaceId.mockResolvedValue(WORKSPACE_ID);
    mocks.upsert.mockResolvedValue({ error: null });
  });

  it('updates a completion state and records the actor transition', async () => {
    const request = new Request(
      `https://contacts.tuturuuu.com/api/v1/workspaces/${WORKSPACE_ID}/user-groups/${GROUP_ID}/group-checks/${POST_ID}`,
      {
        body: JSON.stringify({
          is_completed: true,
          notes: 'Done',
          user_id: USER_ID,
        }),
        method: 'PUT',
      }
    );

    const response = await PUT(request, context);

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      [
        {
          is_completed: true,
          notes: 'Done',
          post_id: POST_ID,
          user_id: USER_ID,
        },
      ],
      { onConflict: 'post_id,user_id' }
    );
    expect(mocks.recordChanges).toHaveBeenCalledWith(expect.anything(), {
      changedBy: ACTOR_ID,
      changes: [
        {
          new_is_completed: true,
          previous_is_completed: false,
          user_id: USER_ID,
        },
      ],
      postId: POST_ID,
    });
  });

  it('resets a completion state to pending and records the transition', async () => {
    const request = new Request(
      `https://contacts.tuturuuu.com/api/v1/workspaces/${WORKSPACE_ID}/user-groups/${GROUP_ID}/group-checks/${POST_ID}`,
      {
        body: JSON.stringify({ user_ids: [USER_ID] }),
        method: 'DELETE',
      }
    );

    const response = await DELETE(request, context);

    expect(response.status).toBe(200);
    expect(mocks.inUsers).toHaveBeenCalledWith('user_id', [USER_ID]);
    expect(mocks.recordChanges).toHaveBeenCalledWith(expect.anything(), {
      changedBy: ACTOR_ID,
      changes: [
        {
          new_is_completed: null,
          previous_is_completed: false,
          user_id: USER_ID,
        },
      ],
      postId: POST_ID,
    });
  });
});
