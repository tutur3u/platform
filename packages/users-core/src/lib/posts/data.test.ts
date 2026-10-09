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

function summaryReceipt(total = 3) {
  return {
    total_count: total,
    missing_check_count: 0,
    pending_approval_stage_count: total,
    approved_awaiting_delivery_count: 0,
    undeliverable_count: 0,
    queued_stage_count: 0,
    processing_stage_count: 0,
    sent_stage_count: 0,
    delivery_failed_count: 0,
    skipped_stage_count: 0,
    rejected_stage_count: 0,
    pending_approval_count: total,
    approved_count: 0,
    rejected_count: 0,
    skipped_approval_count: 0,
    queued_count: 0,
    processing_count: 0,
    sent_count: 0,
    failed_count: 0,
    blocked_count: 0,
    cancelled_count: 0,
    queue_skipped_count: 0,
  };
}

describe('getWorkspacePostsPageData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockImplementation(async (functionName: string) => {
      if (functionName === 'get_workspace_post_review_rows') {
        return {
          data: [
            {
              approval_status: 'PENDING',
              can_remove_approval: false,
              check_created_at: '2026-01-05T00:00:00.000Z',
              email: 'recipient@example.com',
              email_id: null,
              group_id: 'group-1',
              group_name: 'Group 1',
              has_check: true,
              is_completed: true,
              post_id: 'post-1',
              post_title: 'Post 1',
              queue_status: null,
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
          data: [summaryReceipt()],
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
      showAll: true,
    });

    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_workspace_post_review_rows',
      expect.objectContaining({
        p_cutoff: '2026-01-01T00:00:00.000Z',
        p_limit: 25,
        p_offset: 25,
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
  it('counts all staged recipients beyond the page with identical predicates', async () => {
    const rows = Array.from({ length: 1203 }, (_, index) => ({
      row_key: `recipient-${index}`,
      review_stage: 'pending_approval',
      approval_status: 'PENDING',
      queue_status: 'blocked',
      total_count: 1203,
    }));
    mocks.rpc.mockImplementation(async (name, args) => {
      expect(name).toBe('get_workspace_post_review_rows');
      expect(args).toMatchObject({
        p_stage: ['pending_approval'],
        p_approval_status: 'PENDING',
        p_queue_status: 'blocked',
        p_user_id: 'user-1',
        p_included_group_ids: ['group-1'],
        p_excluded_group_ids: ['group-2'],
        p_start_date: '2026-01-02',
        p_end_date: '2026-01-08',
      });
      return {
        data: rows.slice(args.p_offset, args.p_offset + args.p_limit),
        error: null,
      };
    });
    const result = await getWorkspacePostsPageData('workspace-1', {
      stage: 'pending_approval',
      approvalStatus: 'PENDING',
      queueStatus: 'blocked',
      includedGroups: ['group-1'],
      excludedGroups: ['group-2'],
      userId: 'user-1',
      start: '2026-01-02',
      end: '2026-01-08',
      pageSize: 10,
    });
    expect(result.postsData.data).toHaveLength(10);
    expect(result.postsData.count).toBe(1203);
    expect(result.postsStatus).toMatchObject({
      total: 1203,
      stages: { pending_approval: 1203, sent: 0 },
      approvals: { pending: 1203 },
      queue: { blocked: 1203 },
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(4);
  });

  it('retains the full total on a page beyond the last result', async () => {
    mocks.rpc.mockImplementation(async (name) => ({
      data:
        name === 'get_workspace_post_review_rows' ? [] : [summaryReceipt(1203)],
      error: null,
    }));
    const result = await getWorkspacePostsPageData('workspace-1', {
      page: 200,
    });
    expect(result.postsData).toEqual({ count: 1203, data: [] });
  });

  it.each(['missing', 'duplicate', 'drift', 'error'])(
    'fails closed on %s staged totals instead of inventing a count',
    async (failure) => {
      mocks.rpc.mockImplementation(async (_name, args) => {
        if (args.p_offset === 0)
          return {
            data: [{ row_key: 'one', review_stage: 'sent', total_count: 2 }],
            error: null,
          };
        if (failure === 'error')
          return { data: null, error: { message: 'scan failed' } };
        return {
          data:
            failure === 'missing'
              ? []
              : [
                  {
                    row_key: failure === 'duplicate' ? 'one' : 'two',
                    review_stage: 'sent',
                    total_count: 3,
                  },
                ],
          error: null,
        };
      });
      await expect(
        getWorkspacePostsPageData('workspace-1', { stage: 'sent' })
      ).rejects.toThrow();
    }
  );

  it('rejects missing summary totals', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await expect(getWorkspacePostsPageData('workspace-1')).rejects.toThrow(
      'unavailable'
    );
  });
  it.each([
    ['missing stage', { sent_stage_count: undefined }],
    ['null approval', { approved_count: null }],
    ['missing queue', { queued_count: undefined }],
    ['string count', { blocked_count: '0' }],
    ['NaN total', { total_count: Number.NaN }],
    ['negative count', { failed_count: -1 }],
    ['fraction count', { cancelled_count: 0.5 }],
    ['unsafe total', { total_count: Number.MAX_SAFE_INTEGER + 1 }],
    ['stage sum mismatch', { sent_stage_count: 1 }],
    ['approval sum overflow', { approved_count: 1 }],
    ['queue sum overflow', { queued_count: 4 }],
  ])('rejects invalid full summary receipt: %s', async (_label, amendment) => {
    mocks.rpc.mockImplementation(async (name) => ({
      data:
        name === 'get_workspace_post_review_rows'
          ? []
          : [{ ...summaryReceipt(), ...amendment }],
      error: null,
    }));
    await expect(getWorkspacePostsPageData('workspace-1')).rejects.toThrow(
      'Report counts'
    );
  });

  it('accepts an explicit complete zero receipt for a truly empty scope', async () => {
    mocks.rpc.mockImplementation(async (name) => ({
      data:
        name === 'get_workspace_post_review_rows' ? [] : [summaryReceipt(0)],
      error: null,
    }));
    const result = await getWorkspacePostsPageData('workspace-1');
    expect(result.postsData.count).toBe(0);
    expect(result.postsStatus.total).toBe(0);
  });
});
