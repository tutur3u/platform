import { beforeEach, describe, expect, it, vi } from 'vitest';

const { adminClientMock, autoSkipOldPostEmailsMock, createAdminClientMock } =
  vi.hoisted(() => {
    const adminClient = {
      rpc: vi.fn(),
      schema: vi.fn(() => ({
        rpc: adminClient.rpc,
      })),
    };

    return {
      adminClientMock: adminClient,
      autoSkipOldPostEmailsMock: vi.fn(async () => {
        throw new Error('posts read path should not mutate queue state');
      }),
      createAdminClientMock: vi.fn(async () => adminClient),
    };
  });

vi.mock('server-only', () => ({}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@/lib/post-email-queue', () => ({
  autoSkipOldPostEmails: autoSkipOldPostEmailsMock,
  getPostEmailMaxAgeCutoff: () => '2026-01-01T00:00:00.000Z',
}));

import { getPostsPageData } from './data';

describe('getPostsPageData', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    adminClientMock.rpc.mockImplementation(async (functionName: string) => {
      if (functionName === 'get_workspace_post_review_rows') {
        return {
          data: [
            {
              approval_rejection_reason: null,
              approval_approved_at: '2026-01-05T01:00:00.000Z',
              approval_rejected_at: null,
              approval_status: 'APPROVED',
              can_remove_approval: true,
              check_created_at: '2026-01-05T00:00:00.000Z',
              delivery_issue_reason: null,
              email: 'recipient@example.com',
              email_id: 'email-1',
              group_id: 'group-1',
              group_name: 'Group 1',
              has_check: true,
              is_completed: true,
              notes: null,
              post_content: 'Content',
              post_created_at: '2026-01-04T00:00:00.000Z',
              post_id: 'post-1',
              post_title: 'Post 1',
              queue_attempt_count: 0,
              queue_cancelled_at: null,
              queue_claimed_at: null,
              queue_created_at: '2026-01-05T01:05:00.000Z',
              queue_last_error: null,
              queue_last_attempt_at: '2026-01-05T01:10:00.000Z',
              queue_sent_at: null,
              queue_skipped_at: null,
              queue_status: 'queued',
              queue_updated_at: '2026-01-05T01:10:00.000Z',
              recipient: 'Recipient',
              review_stage: 'pending_approval',
              row_key: 'row-1',
              subject: 'Subject',
              total_count: 3,
              user_avatar_url: null,
              user_display_name: 'Recipient',
              user_full_name: 'Recipient Example',
              user_id: 'user-1',
              user_phone: null,
              ws_id: 'workspace-1',
            },
          ],
          error: null,
        };
      }

      if (functionName === 'get_workspace_post_review_summary') {
        return {
          data: [
            {
              approved_awaiting_delivery_count: 0,
              approved_count: 1,
              blocked_count: 0,
              cancelled_count: 0,
              delivery_failed_count: 0,
              failed_count: 0,
              missing_check_count: 0,
              pending_approval_count: 0,
              pending_approval_stage_count: 3,
              processing_count: 0,
              processing_stage_count: 0,
              queue_skipped_count: 0,
              queued_count: 1,
              queued_stage_count: 0,
              rejected_count: 0,
              rejected_stage_count: 0,
              sent_count: 0,
              sent_stage_count: 0,
              skipped_approval_count: 0,
              skipped_stage_count: 0,
              total_count: 3,
              undeliverable_count: 0,
            },
          ],
          error: null,
        };
      }

      return { data: null, error: new Error(`Unexpected RPC ${functionName}`) };
    });
  });

  it('loads post rows and summary without running queue cleanup on the read path', async () => {
    const result = await getPostsPageData('workspace-1', {
      page: 2,
      pageSize: 25,
      stage: 'pending_approval',
    });

    expect(autoSkipOldPostEmailsMock).not.toHaveBeenCalled();
    expect(adminClientMock.schema).toHaveBeenCalledWith('private');
    expect(adminClientMock.rpc).toHaveBeenCalledWith(
      'get_workspace_post_review_rows',
      expect.objectContaining({
        p_cutoff: '2026-01-01T00:00:00.000Z',
        p_limit: 25,
        p_offset: 25,
        p_stage: ['pending_approval'],
        p_ws_id: 'workspace-1',
      })
    );
    expect(adminClientMock.rpc).toHaveBeenCalledWith(
      'get_workspace_post_review_summary',
      expect.objectContaining({
        p_cutoff: '2026-01-01T00:00:00.000Z',
        p_ws_id: 'workspace-1',
      })
    );
    expect(result.postsData.count).toBe(3);
    expect(result.postsData.data[0]).toMatchObject({
      approval_approved_at: '2026-01-05T01:00:00.000Z',
      id: 'row-1',
      queue_created_at: '2026-01-05T01:05:00.000Z',
      queue_last_attempt_at: '2026-01-05T01:10:00.000Z',
      queue_skipped_at: null,
      stage: 'pending_approval',
      user_id: 'user-1',
    });
    expect(result.postsStatus.total).toBe(3);
  });
});
