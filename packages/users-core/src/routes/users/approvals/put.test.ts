import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  getWorkspaceUserLinkForUser: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  postCheckMaybeSingle: vi.fn(),
  privateFrom: vi.fn(),
  privateRpc: vi.fn(),
  updatePostCheck: vi.fn(),
  verifySecret: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifySecret: mocks.verifySecret,
}));

vi.mock('@tuturuuu/utils/workspace-user-link', () => ({
  getWorkspaceUserLinkForUser: mocks.getWorkspaceUserLinkForUser,
}));

import { handlePutApprovalsRequest } from './put';

const actor = { email: 'approver@example.com', id: 'platform-user-1' };
const context = { params: Promise.resolve({ wsId: 'workspace-alias' }) };

function createFilterBuilder(result: () => Promise<unknown>) {
  const builder = {
    eq: vi.fn(),
    maybeSingle: result,
  };
  builder.eq.mockReturnValue(builder);
  return builder;
}

describe('Contacts approval mutation handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue('workspace-1');
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'approve_posts',
      withoutPermission: () => false,
    });
    mocks.getWorkspaceUserLinkForUser.mockResolvedValue({
      virtual_user_id: 'workspace-user-1',
    });
    mocks.postCheckMaybeSingle.mockResolvedValue({
      data: {
        approval_status: 'PENDING',
        post_id: 'post-1',
        user_group_posts: { group_id: 'group-1' },
        user_id: 'recipient-1',
      },
      error: null,
    });
    mocks.updatePostCheck.mockResolvedValue({ error: null });
    mocks.privateRpc.mockResolvedValue({ data: null, error: null });
    mocks.verifySecret.mockResolvedValue(true);

    const selectBuilder = createFilterBuilder(mocks.postCheckMaybeSingle);
    const updateBuilder = createFilterBuilder(mocks.updatePostCheck);
    const update = vi.fn().mockReturnValue(updateBuilder);
    mocks.privateFrom.mockImplementation((table: string) => {
      if (table !== 'user_group_post_checks') {
        throw new Error(`Unexpected private table ${table}`);
      }
      return {
        select: vi.fn().mockReturnValue(selectBuilder),
        update,
      };
    });
    mocks.createAdminClient.mockResolvedValue({
      schema: (schema: string) => {
        if (schema !== 'private') {
          throw new Error(`Unexpected schema ${schema}`);
        }
        return { from: mocks.privateFrom, rpc: mocks.privateRpc };
      },
    });
  });

  it('approves a workspace-scoped post recipient with the satellite actor', async () => {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-alias/users/approvals',
      {
        body: JSON.stringify({
          action: 'approve',
          itemId: 'post-1:recipient-1',
          kind: 'posts',
        }),
        method: 'PUT',
      }
    );

    const response = await handlePutApprovalsRequest(request, context, actor);

    expect(response.status).toBe(200);
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      request,
      user: actor,
      wsId: 'workspace-1',
    });
    expect(mocks.getWorkspaceUserLinkForUser).toHaveBeenCalledWith(
      'workspace-1',
      'platform-user-1',
      { authorizationClient: expect.anything() }
    );
    expect(mocks.privateFrom).toHaveBeenCalledWith('user_group_post_checks');
    expect(mocks.privateRpc).toHaveBeenCalledWith(
      'reconcile_orphaned_approved_post_email_queue',
      {
        p_cutoff: null,
        p_max_posts: null,
        p_skip_posts: 0,
        p_ws_id: 'workspace-1',
      }
    );
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('rejects malformed post approval IDs before querying protected data', async () => {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-alias/users/approvals',
      {
        body: JSON.stringify({
          action: 'approve',
          itemId: 'not-a-composite-id',
          kind: 'posts',
        }),
        method: 'PUT',
      }
    );

    const response = await handlePutApprovalsRequest(request, context, actor);

    expect(response.status).toBe(400);
    expect(mocks.privateFrom).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: 'Invalid post approval item ID',
    });
  });

  it('does not create an admin client without post approval permission', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: () => false,
      withoutPermission: () => true,
    });
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-alias/users/approvals',
      {
        body: JSON.stringify({
          action: 'approve',
          itemId: 'post-1:recipient-1',
          kind: 'posts',
        }),
        method: 'PUT',
      }
    );

    const response = await handlePutApprovalsRequest(request, context, actor);

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
