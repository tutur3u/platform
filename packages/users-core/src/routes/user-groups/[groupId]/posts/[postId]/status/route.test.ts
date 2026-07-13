import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  resolveWorkspaceId: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('../../../../../../lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.getPermissions,
}));
vi.mock('../../../../../../lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: mocks.resolveWorkspaceId,
}));

import { GET } from './route';

const WS_ID = '10000000-0000-4000-8000-000000000001';
const GROUP_ID = '20000000-0000-4000-8000-000000000002';
const POST_ID = '30000000-0000-4000-8000-000000000003';

describe('Contacts-compatible group post status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspaceId.mockResolvedValue(WS_ID);
    mocks.getPermissions.mockResolvedValue({ withoutPermission: () => false });
    mocks.createAdminClient.mockResolvedValue({
      schema: () => ({ rpc: mocks.rpc }),
    });
  });

  it('maps the private status summary into the client response', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          blocked_count: 1,
          completed_count: 6,
          failed_count: 2,
          incomplete_count: 3,
          missing_check_count: 4,
          queued_count: 5,
          sent_count: 6,
          sent_stage_count: 0,
          total_count: 9,
          undeliverable_count: 1,
        },
      ],
      error: null,
    });

    const response = await GET(
      new Request('https://contacts.tuturuuu.com/api/status'),
      {
        params: Promise.resolve({
          groupId: GROUP_ID,
          postId: POST_ID,
          wsId: WS_ID,
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        can_remove_approval: true,
        checked: 6,
        count: 9,
        failed: 3,
        missing_check: 4,
        queue: expect.objectContaining({
          blocked: 1,
          failed: 2,
          queued: 5,
          sent: 6,
        }),
        undeliverable: 1,
      })
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_user_group_post_status_summary',
      { p_group_id: GROUP_ID, p_post_id: POST_ID, p_ws_id: WS_ID }
    );
  });

  it('rejects status reads without permission', async () => {
    mocks.getPermissions.mockResolvedValue({ withoutPermission: () => true });

    const response = await GET(
      new Request('https://contacts.tuturuuu.com/api/status'),
      {
        params: Promise.resolve({
          groupId: GROUP_ID,
          postId: POST_ID,
          wsId: WS_ID,
        }),
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
