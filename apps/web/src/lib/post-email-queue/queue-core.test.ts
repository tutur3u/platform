import { describe, expect, it } from 'vitest';
import { enqueueApprovedPostEmails } from './queue-core';
import { POST_EMAIL_QUERY_CHUNK_SIZE } from './utils';

const APPROVER_ID = 'approver-1';
const GROUP_ID = 'group-1';
const POST_ID = 'post-1';
const PLATFORM_USER_ID = 'platform-1';
const WS_ID = 'ws-1';

type MockState = {
  allCheckChunks: number[];
  sentReceiverChunks: number[];
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
        return { data: [], error: null };

      case 'post_email_queue':
        return { data: [], error: null };

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
});
