import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return {
    createAdminClient: vi.fn(async () => ({
      schema: vi.fn(() => ({ rpc })),
    })),
    rpc,
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('./date-range', () => ({
  getPostEmailMaxAgeCutoff: () => '2026-01-01T00:00:00.000Z',
}));

import { getWorkspacePostsPageData } from './data';

describe('getWorkspacePostsPageData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockImplementation(async (functionName: string) => {
      if (functionName === 'get_workspace_post_review_rows') {
        return {
          data: [
            {
              approval_status: 'APPROVED',
              can_remove_approval: true,
              check_created_at: '2026-01-05T00:00:00.000Z',
              email: 'recipient@example.com',
              email_id: 'email-1',
              group_id: 'group-1',
              group_name: 'Group 1',
              has_check: true,
              is_completed: true,
              post_id: 'post-1',
              post_title: 'Post 1',
              queue_status: 'queued',
              review_stage: 'pending_approval',
              row_key: 'row-1',
              total_count: 3,
              user_id: 'user-1',
              ws_id: 'workspace-1',
            },
          ],
          error: null,
        };
      }
      if (functionName === 'get_workspace_post_review_summary') {
        return {
          data: [{ pending_approval_stage_count: 3, total_count: 3 }],
          error: null,
        };
      }
      return { data: null, error: new Error(`Unexpected RPC ${functionName}`) };
    });
  });

  it('loads review rows and summary from private read-only RPCs', async () => {
    const result = await getWorkspacePostsPageData('workspace-1', {
      page: 2,
      pageSize: 25,
      stage: 'pending_approval',
    });

    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_workspace_post_review_rows',
      expect.objectContaining({
        p_cutoff: '2026-01-01T00:00:00.000Z',
        p_limit: 25,
        p_offset: 25,
        p_stage: ['pending_approval'],
        p_ws_id: 'workspace-1',
      })
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_workspace_post_review_summary',
      expect.objectContaining({
        p_cutoff: '2026-01-01T00:00:00.000Z',
        p_ws_id: 'workspace-1',
      })
    );
    expect(result.postsData.count).toBe(3);
    expect(result.postsData.data[0]).toMatchObject({
      id: 'row-1',
      stage: 'pending_approval',
      user_id: 'user-1',
    });
    expect(result.postsStatus.total).toBe(3);
  });
});
