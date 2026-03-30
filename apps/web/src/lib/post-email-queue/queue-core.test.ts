import { describe, expect, it } from 'vitest';
import {
  enqueueApprovedPostEmails,
  fetchAllPaginatedRows,
  reconcileOrphanedApprovedPosts,
} from './queue-core';
import { POST_EMAIL_QUERY_CHUNK_SIZE } from './utils';

const APPROVER_ID = 'approver-1';
const GROUP_ID = 'group-1';
const POST_ID = 'post-1';
const PLATFORM_USER_ID = 'platform-1';
const WS_ID = 'ws-1';

type MockState = {
  allCheckChunks: number[];
  existingQueueRows: Array<{ id: string; status: string; user_id: string }>;
  sentReceiverChunks: number[];
  sentReceiverIds: string[];
  upsertRows: Array<Record<string, unknown>>;
  userCheckChunks: number[];
};

function createMockQueryBuilder(
  table: string,
  state: MockState,
  userIds: string[]
) {
  const eqFilters = new Map<string, unknown>();
  const inFilters = new Map<string, string[]>();
  let selectClause: string | null = null;

  const execute = () => {
    switch (table) {
      case 'user_group_post_checks': {
        const chunkUserIds = inFilters.get('user_id') ?? userIds;
        if (selectClause?.includes('user:workspace_users')) {
          return {
            data: chunkUserIds.map((userId) => ({
              approved_by: APPROVER_ID,
              approval_status: 'APPROVED',
              is_completed: true,
              user: {
                email: `${userId}@example.com`,
                id: userId,
                ws_id: WS_ID,
              },
              user_id: userId,
            })),
            error: null,
          };
        }

        return {
          data: chunkUserIds.map((userId) => ({
            approved_by: APPROVER_ID,
            approval_status: 'APPROVED',
            is_completed: true,
            user_id: userId,
          })),
          error: null,
        };
      }

      case 'sent_emails':
        return {
          data: state.sentReceiverIds.map((receiverId) => ({
            receiver_id: receiverId,
          })),
          error: null,
        };

      case 'post_email_queue':
        return {
          data: state.existingQueueRows,
          error: null,
        };

      case 'workspace_user_linked_users':
        return {
          data: [
            {
              platform_user_id: PLATFORM_USER_ID,
              virtual_user_id: APPROVER_ID,
            },
          ],
          error: null,
        };

      default:
        throw new Error(`unexpected table ${table}`);
    }
  };

  const builder = {
    eq(field: string, value: unknown) {
      eqFilters.set(field, value);
      return builder;
    },

    in(field: string, values: string[]) {
      if (
        (table === 'user_group_post_checks' && field === 'user_id') ||
        (table === 'sent_emails' && field === 'receiver_id')
      ) {
        if (values.length > POST_EMAIL_QUERY_CHUNK_SIZE) {
          throw new Error(`oversized ${table}.${field} chunk`);
        }

        if (table === 'user_group_post_checks') {
          if (selectClause?.includes('user:workspace_users')) {
            state.userCheckChunks.push(values.length);
          } else {
            state.allCheckChunks.push(values.length);
          }
        } else {
          state.sentReceiverChunks.push(values.length);
        }
      }

      inFilters.set(field, values);
      return builder;
    },

    maybeSingle() {
      if (table !== 'user_group_posts') {
        throw new Error(`unexpected maybeSingle on ${table}`);
      }

      return Promise.resolve({
        data: {
          id: POST_ID,
          group_id: GROUP_ID,
          created_at: '2026-03-20T00:00:00.000Z',
          workspace_user_groups: {
            ws_id: WS_ID,
          },
        },
        error: null,
      });
    },

    select(value: string) {
      selectClause = value;
      return builder;
    },

    upsert(rows: Array<Record<string, unknown>>) {
      if (table !== 'post_email_queue') {
        throw new Error(`unexpected upsert on ${table}`);
      }

      state.upsertRows = rows;
      return Promise.resolve({ error: null });
    },
  };

  Object.defineProperty(builder, 'then', {
    value<TResult1 = unknown, TResult2 = never>(
      onfulfilled?:
        | ((value: {
            data: unknown;
            error: null;
          }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null
    ) {
      return Promise.resolve(execute()).then(onfulfilled, onrejected);
    },
  });

  return builder;
}

function createMockAdminClient(userIds: string[]) {
  const state: MockState = {
    allCheckChunks: [],
    existingQueueRows: [],
    sentReceiverIds: [],
    sentReceiverChunks: [],
    upsertRows: [],
    userCheckChunks: [],
  };

  return {
    sbAdmin: {
      from: (table: string) => createMockQueryBuilder(table, state, userIds),
    },
    state,
  };
}

describe('enqueueApprovedPostEmails', () => {
  it('collects paginated select results beyond the first 1000 rows', async () => {
    const rows = await fetchAllPaginatedRows<number>(async (from, to) => ({
      data: Array.from(
        { length: Math.max(0, Math.min(1001, to + 1) - from) },
        (_, index) => from + index
      ),
      error: null,
    }));

    expect(rows).toHaveLength(1001);
    expect(rows[0]).toBe(0);
    expect(rows.at(-1)).toBe(1000);
  });

  it('chunks large user cohorts before querying checks and sent email coverage', async () => {
    const userIds = Array.from(
      { length: POST_EMAIL_QUERY_CHUNK_SIZE + 7 },
      (_, index) => `user-${index}`
    );
    const { sbAdmin, state } = createMockAdminClient(userIds);

    const result = await enqueueApprovedPostEmails(sbAdmin as never, {
      groupId: GROUP_ID,
      postId: POST_ID,
      userIds,
      wsId: WS_ID,
    });

    expect(result.queued).toBe(userIds.length);
    expect(state.userCheckChunks).toEqual([POST_EMAIL_QUERY_CHUNK_SIZE, 7]);
    expect(state.allCheckChunks).toEqual([POST_EMAIL_QUERY_CHUNK_SIZE, 7]);
    expect(state.sentReceiverChunks).toEqual([POST_EMAIL_QUERY_CHUNK_SIZE, 7]);
    expect(state.upsertRows).toHaveLength(userIds.length);
  });

  it('requeues eligible recipients when the existing queue row is skipped', async () => {
    const userId = 'user-1';
    const { sbAdmin, state } = createMockAdminClient([userId]);
    state.existingQueueRows = [
      {
        id: 'queue-1',
        status: 'skipped',
        user_id: userId,
      },
    ];

    const result = await enqueueApprovedPostEmails(sbAdmin as never, {
      groupId: GROUP_ID,
      postId: POST_ID,
      userIds: [userId],
      wsId: WS_ID,
    });

    expect(result.queued).toBe(1);
    expect(result.diagnostics.upserted).toBe(1);
    expect(result.diagnostics.existingSkipped).toBe(0);
    expect(state.upsertRows).toEqual([
      expect.objectContaining({
        post_id: POST_ID,
        status: 'queued',
        user_id: userId,
      }),
    ]);
  });

  it('maps the reconciliation rpc result without falling back to row scans', async () => {
    const rpc = async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe('reconcile_orphaned_approved_post_email_queue');
      expect(args).toMatchObject({
        p_cutoff: expect.any(String),
        p_max_posts: 25,
        p_skip_posts: 0,
        p_ws_id: WS_ID,
      });

      return {
        data: [
          {
            already_sent: 3,
            checked: 10,
            covered_by_existing_queue: 4,
            covered_by_sent_email: 3,
            eligible_recipients: 2,
            enqueued: 2,
            existing_processing: 0,
            existing_queued: 0,
            existing_skipped: 0,
            missing_completion: 0,
            missing_email: 1,
            missing_sender_platform_user: 0,
            missing_user_record: 0,
            not_approved: 0,
            orphaned: 3,
            processed_posts: 2,
            remaining_posts: 5,
            upserted: 2,
          },
        ],
        error: null,
      };
    };

    const result = await reconcileOrphanedApprovedPosts(
      {
        from: () => createMockQueryBuilder('unexpected', {} as never, []),
        rpc,
      } as never,
      {
        maxPosts: 25,
        wsId: WS_ID,
      }
    );

    expect(result).toEqual({
      checked: 10,
      diagnostics: {
        alreadySent: 3,
        checked: 10,
        coveredByExistingQueue: 4,
        coveredBySentEmail: 3,
        eligibleRecipients: 2,
        existingProcessing: 0,
        existingQueued: 0,
        existingSkipped: 0,
        missingCompletion: 0,
        missingEmail: 1,
        missingSenderPlatformUser: 0,
        missingUserRecord: 0,
        notApproved: 0,
        orphaned: 3,
        upserted: 2,
      },
      enqueued: 2,
      processedPosts: 2,
      remainingPosts: 5,
    });
  });
});
