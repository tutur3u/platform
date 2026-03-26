import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock, getPermissionsMock, rpcMock } = vi.hoisted(
  () => ({
    createAdminClientMock: vi.fn(),
    getPermissionsMock: vi.fn(),
    rpcMock: vi.fn(),
  })
);

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: getPermissionsMock,
}));

import { GET } from './route';

describe('group post status route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createAdminClientMock.mockResolvedValue({
      rpc: rpcMock,
    });

    getPermissionsMock.mockResolvedValue({
      withoutPermission: vi.fn().mockReturnValue(false),
    });
  });

  it('returns summary counts from the unified recipient status RPC', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          approved_awaiting_delivery_count: 2,
          blocked_count: 1,
          cancelled_count: 0,
          completed_count: 4,
          failed_count: 0,
          incomplete_count: 1,
          missing_check_count: 3,
          processing_count: 2,
          queue_skipped_count: 1,
          queued_count: 5,
          sent_count: 6,
          sent_stage_count: 6,
          total_count: 10,
        },
      ],
      error: null,
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/user-groups/group-1/posts/post-1/status'
      ),
      {
        params: Promise.resolve({
          groupId: 'group-1',
          postId: 'post-1',
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      approved_awaiting_delivery: 2,
      can_remove_approval: false,
      checked: 4,
      count: 10,
      failed: 1,
      missing_check: 3,
      queue: {
        blocked: 1,
        cancelled: 0,
        failed: 0,
        processing: 2,
        queued: 5,
        sent: 6,
        skipped: 1,
      },
      sent: 6,
      tentative: 3,
    });

    expect(rpcMock).toHaveBeenCalledWith('get_user_group_post_status_summary', {
      p_group_id: 'group-1',
      p_post_id: 'post-1',
      p_ws_id: 'ws-1',
    });
  });
});
