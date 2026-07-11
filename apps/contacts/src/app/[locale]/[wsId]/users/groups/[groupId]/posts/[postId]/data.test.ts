import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock, rpcMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
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

function createQuery(result: { data: unknown; error: unknown }) {
  const eqCalls: Array<[string, unknown]> = [];
  const query = {
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push([column, value]);
      return query;
    }),
    maybeSingle: vi.fn(async () => result),
    select: vi.fn(() => query),
  };

  return {
    eqCalls,
    query,
  };
}

function createReceiverSensitiveSupabaseClient({
  groupResult = { data: null, error: null },
  postResult = { data: null, error: null },
}: {
  groupResult?: { data: unknown; error: unknown };
  postResult?: { data: unknown; error: unknown };
} = {}) {
  const groupQuery = createQuery(groupResult);
  const postQuery = createQuery(postResult);
  const privateSchemaClient = {
    from: vi.fn((table: string) => {
      if (table !== 'user_group_posts') {
        throw new Error(`unexpected private table ${table}`);
      }

      return postQuery.query;
    }),
    rpc(this: unknown, fn: string, args: Record<string, unknown>) {
      if (this !== privateSchemaClient) {
        throw new TypeError('rpc called without private schema receiver');
      }

      return rpcMock(fn, args);
    },
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table !== 'workspace_user_groups') {
        throw new Error(`unexpected public table ${table}`);
      }

      return groupQuery.query;
    }),
    schema: vi.fn((schema: string) => {
      if (schema !== 'private') {
        throw new Error(`unexpected schema ${schema}`);
      }

      return privateSchemaClient;
    }),
  };

  return {
    client,
    groupQuery,
    postQuery,
    privateSchemaClient,
  };
}

describe('group post detail data helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('binds post data to the requested workspace and group', async () => {
    const mocks = createReceiverSensitiveSupabaseClient({
      postResult: {
        data: { id: 'post-1', title: 'Post 1' },
        error: null,
      },
    });
    createAdminClientMock.mockResolvedValue(mocks.client);

    await expect(getPostData('ws-1', 'group-1', 'post-1')).resolves.toEqual({
      id: 'post-1',
      title: 'Post 1',
    });

    expect(mocks.client.schema).toHaveBeenCalledWith('private');
    expect(mocks.privateSchemaClient.from).toHaveBeenCalledWith(
      'user_group_posts'
    );
    expect(mocks.postQuery.query.select).toHaveBeenCalledWith(
      expect.stringContaining('workspace_user_groups!inner(ws_id)')
    );
    expect(mocks.postQuery.eqCalls).toEqual([
      ['id', 'post-1'],
      ['workspace_user_groups.ws_id', 'ws-1'],
      ['group_id', 'group-1'],
    ]);
  });

  it('rejects posts outside the requested workspace or group', async () => {
    const mocks = createReceiverSensitiveSupabaseClient({
      postResult: {
        data: null,
        error: null,
      },
    });
    createAdminClientMock.mockResolvedValue(mocks.client);

    await expect(getPostData('ws-1', 'group-1', 'post-2')).rejects.toThrow(
      'not-found'
    );
  });

  it('loads group data from the workspace group table', async () => {
    const mocks = createReceiverSensitiveSupabaseClient({
      groupResult: {
        data: { id: 'group-1', name: 'Group 1' },
        error: null,
      },
    });
    createAdminClientMock.mockResolvedValue(mocks.client);

    await expect(getGroupData('ws-1', 'group-1')).resolves.toEqual({
      id: 'group-1',
      name: 'Group 1',
    });

    expect(mocks.groupQuery.eqCalls).toEqual([
      ['ws_id', 'ws-1'],
      ['id', 'group-1'],
    ]);
  });

  it('calls the post status RPC with the private schema receiver intact', async () => {
    const mocks = createReceiverSensitiveSupabaseClient();
    createAdminClientMock.mockResolvedValue(mocks.client);
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
    const mocks = createReceiverSensitiveSupabaseClient();
    createAdminClientMock.mockResolvedValue(mocks.client);
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
