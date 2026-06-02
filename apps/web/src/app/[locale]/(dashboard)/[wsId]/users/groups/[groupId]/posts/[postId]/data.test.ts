import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock, maybeSingleMock, rpcMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('server-only', () => ({}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

import {
  getGroupData,
  getPostData,
  getPostStatus,
  getRecipientRows,
} from './data';

function createReceiverSensitiveSupabaseClient() {
  const privateSchemaClient = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: maybeSingleMock,
        })),
      })),
    })),
    rpc(this: unknown, fn: string, args: Record<string, unknown>) {
      if (this !== privateSchemaClient) {
        throw new TypeError('rpc called without private schema receiver');
      }

      return rpcMock(fn, args);
    },
  };

  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: maybeSingleMock,
          })),
        })),
      })),
    })),
    schema: vi.fn((schema: string) => {
      if (schema !== 'private') {
        throw new Error(`unexpected schema ${schema}`);
      }

      return privateSchemaClient;
    }),
  };
}

describe('group post detail data helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminClientMock.mockResolvedValue(
      createReceiverSensitiveSupabaseClient()
    );
  });

  it('loads post data from the private schema', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { id: 'post-1', title: 'Post 1' },
      error: null,
    });

    await expect(getPostData('post-1')).resolves.toEqual({
      id: 'post-1',
      title: 'Post 1',
    });
  });

  it('loads group data from the workspace group table', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { id: 'group-1', name: 'Group 1' },
      error: null,
    });

    await expect(getGroupData('ws-1', 'group-1')).resolves.toEqual({
      id: 'group-1',
      name: 'Group 1',
    });
  });

  it('calls the post status RPC with the private schema receiver intact', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          approved_count: 2,
          completed_count: 4,
          delivery_failed_count: 1,
          incomplete_count: 3,
          missing_check_count: 5,
          pending_approval_count: 6,
          processing_stage_count: 7,
          queued_stage_count: 8,
          rejected_count: 9,
          sent_stage_count: 10,
          total_count: 11,
          undeliverable_count: 12,
        },
      ],
      error: null,
    });

    await expect(getPostStatus('ws-1', 'group-1', 'post-1')).resolves.toEqual({
      approvals: {
        approved: 2,
        pending: 6,
        rejected: 9,
      },
      completed: 4,
      count: 11,
      delivery_failed: 1,
      incomplete: 3,
      missing_check: 5,
      processing: 7,
      queued: 8,
      sent: 10,
      undeliverable: 12,
    });

    expect(rpcMock).toHaveBeenCalledWith('get_user_group_post_status_summary', {
      p_group_id: 'group-1',
      p_post_id: 'post-1',
      p_ws_id: 'ws-1',
    });
  });

  it('calls the recipient rows RPC with the private schema receiver intact', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          row_key: 'recipient-1',
          user_avatar_url: '',
          user_id: 'user-1',
        },
      ],
      error: null,
    });

    await expect(
      getRecipientRows('ws-1', 'group-1', 'post-1', { q: 'alice' })
    ).resolves.toEqual([
      {
        row_key: 'recipient-1',
        user_avatar_url: null,
        user_id: 'user-1',
      },
    ]);

    expect(rpcMock).toHaveBeenCalledWith('get_user_group_post_recipient_rows', {
      p_group_id: 'group-1',
      p_post_id: 'post-1',
      p_q: 'alice',
      p_ws_id: 'ws-1',
    });
  });
});
