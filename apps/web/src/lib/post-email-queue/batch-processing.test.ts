import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const emailServiceSendMock = vi.fn();
  const fromWorkspaceAdminMock = vi.fn(async () => ({
    send: emailServiceSendMock,
  }));

  class MockEmailService {
    static fromWorkspaceAdmin = fromWorkspaceAdminMock;
  }

  return {
    EmailService: MockEmailService,
    emailServiceSendMock,
    fromWorkspaceAdminMock,
  };
});

vi.mock('@react-email/render', () => ({
  render: vi.fn(async () => '<html />'),
}));

vi.mock('@tuturuuu/email-service', () => ({
  EmailService: mocks.EmailService,
}));

vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/mail/default-email-template',
  () => ({
    default: vi.fn(() => null),
  })
);

import {
  processPostEmailQueueBatch,
  sendPostEmailImmediately,
} from '@/lib/post-email-queue';
import { buildPostEmailSubject } from './batch-processing';

const WS_ID = 'ws-1';
const GROUP_ID = 'group-1';
const POST_ID = 'post-1';
const USER_ID = 'user-1';
const USER_ID_2 = 'user-2';
const SENDER_PLATFORM_USER_ID = 'sender-1';
const QUEUE_ID = 'queue-1';
const RECIPIENT_EMAIL = 'blocked@tuturuuu.com';

type QueueRow = {
  attempt_count: number;
  batch_id: string | null;
  blocked_reason: string | null;
  cancelled_at: string | null;
  claimed_at: string | null;
  created_at: string;
  group_id: string;
  id: string;
  last_attempt_at: string | null;
  last_error: string | null;
  post_id: string;
  sender_platform_user_id: string;
  sent_at: string | null;
  sent_email_id: string | null;
  status:
    | 'blocked'
    | 'cancelled'
    | 'failed'
    | 'processing'
    | 'queued'
    | 'sent'
    | 'skipped';
  updated_at: string;
  user_id: string;
  ws_id: string;
};

type CheckRow = {
  approval_status: string;
  is_completed: boolean | null;
  notes: string | null;
  post_id: string;
  user: {
    display_name: string | null;
    email: string | null;
    full_name: string | null;
    id: string;
  } | null;
  user_id: string;
};

type SentEmailRow = {
  created_at: string;
  email?: string;
  id: string;
  post_id: string | null;
  receiver_id: string;
  source_email?: string;
  source_name?: string;
  subject?: string;
  content?: string;
  sender_id?: string;
  ws_id?: string;
};

type EmailAuditRow = {
  created_at: string;
  entity_id: string | null;
  entity_type: string;
  html_content: string | null;
  id: string;
  sent_at: string | null;
  source_email: string;
  source_name: string;
  status: string;
  subject: string;
  to_addresses: string[];
  user_id: string | null;
};

function createQueueRow(
  overrides: Partial<QueueRow> & {
    id: string;
    user_id: string;
  }
): QueueRow {
  return {
    attempt_count: overrides.attempt_count ?? 0,
    batch_id: overrides.batch_id ?? null,
    blocked_reason: overrides.blocked_reason ?? null,
    cancelled_at: overrides.cancelled_at ?? null,
    claimed_at: overrides.claimed_at ?? null,
    created_at: overrides.created_at ?? '2026-03-28T00:00:00.000Z',
    group_id: overrides.group_id ?? GROUP_ID,
    id: overrides.id,
    last_attempt_at: overrides.last_attempt_at ?? null,
    last_error: overrides.last_error ?? null,
    post_id: overrides.post_id ?? POST_ID,
    sender_platform_user_id:
      overrides.sender_platform_user_id ?? SENDER_PLATFORM_USER_ID,
    sent_at: overrides.sent_at ?? null,
    sent_email_id: overrides.sent_email_id ?? null,
    status: overrides.status ?? 'queued',
    updated_at: overrides.updated_at ?? '2026-03-28T00:00:00.000Z',
    user_id: overrides.user_id,
    ws_id: overrides.ws_id ?? WS_ID,
  };
}

function createCheckRow(
  overrides: Partial<CheckRow> & { user_id: string; userEmail: string }
): CheckRow {
  return {
    approval_status: overrides.approval_status ?? 'APPROVED',
    is_completed: overrides.is_completed ?? true,
    notes: overrides.notes ?? null,
    post_id: overrides.post_id ?? POST_ID,
    user: {
      display_name: overrides.user?.display_name ?? 'Recipient',
      email: overrides.userEmail,
      full_name: overrides.user?.full_name ?? 'Recipient',
      id: overrides.user?.id ?? overrides.user_id,
    },
    user_id: overrides.user_id,
  };
}

function matchesFilters(
  row: Record<string, unknown>,
  eqFilters: Map<string, unknown>,
  inFilters: Map<string, unknown[]>
): boolean {
  for (const [field, value] of eqFilters.entries()) {
    if (row[field] !== value) {
      return false;
    }
  }

  for (const [field, values] of inFilters.entries()) {
    if (!values.includes(row[field])) {
      return false;
    }
  }

  return true;
}

function createSbAdminMock({
  blockedEmails = new Set<string>(),
  checkRows,
  emailAuditRows = [],
  failSentEmailInsert = false,
  onSendEmail,
  queueRows,
  sentEmailRows = [],
}: {
  blockedEmails?: Set<string>;
  checkRows: CheckRow[];
  emailAuditRows?: EmailAuditRow[];
  failSentEmailInsert?: boolean;
  onSendEmail?: () => void;
  queueRows: QueueRow[];
  sentEmailRows?: SentEmailRow[];
}) {
  const state = {
    checkEmailUpdates: [] as Array<{
      post_id: string;
      user_id: string;
      email_id: string;
    }>,
    queueRows: [...queueRows],
    queueUpdates: [] as Array<{
      ids: string[];
      patch: Record<string, unknown>;
    }>,
    sentEmailRows: [...sentEmailRows],
  };

  const sentEmailInsertMock = vi.fn((row: Record<string, unknown>) => ({
    select: vi.fn(() => ({
      single: vi.fn(async () => {
        if (failSentEmailInsert) {
          return {
            data: null,
            error: { message: 'sent_emails insert failed' },
          };
        }

        const insertedRow: SentEmailRow = {
          created_at: '2026-03-28T00:05:00.000Z',
          id: `sent-${state.sentEmailRows.length + 1}`,
          post_id: row.post_id as string,
          receiver_id: row.receiver_id as string,
          email: row.email as string,
          content: row.content as string,
          sender_id: row.sender_id as string,
          source_email: row.source_email as string,
          source_name: row.source_name as string,
          subject: row.subject as string,
          ws_id: row.ws_id as string,
        };
        state.sentEmailRows.push(insertedRow);
        onSendEmail?.();
        return {
          data: {
            created_at: insertedRow.created_at,
            id: insertedRow.id,
          },
          error: null,
        };
      }),
    })),
  }));

  const sbAdmin = {
    rpc: vi.fn(async (_name: string, args: { p_emails: string[] }) => ({
      data: args.p_emails.map((email) => ({
        email,
        is_blocked: blockedEmails.has(email),
        reason: null,
      })),
      error: null,
    })),
    from: (table: string) => {
      switch (table) {
        case 'post_email_queue':
          return {
            select: vi.fn(() => {
              const eqFilters = new Map<string, unknown>();
              return {
                eq(field: string, value: unknown) {
                  eqFilters.set(field, value);
                  return this;
                },
                order() {
                  return this;
                },
                limit: vi.fn(async (limit: number) => ({
                  data: state.queueRows
                    .filter((row) => matchesFilters(row, eqFilters, new Map()))
                    .slice(0, limit),
                  error: null,
                })),
                maybeSingle: vi.fn(async () => ({
                  data:
                    state.queueRows.find((row) =>
                      matchesFilters(row, eqFilters, new Map())
                    ) ?? null,
                  error: null,
                })),
              };
            }),
            update: vi.fn((patch: Record<string, unknown>) => {
              const eqFilters = new Map<string, unknown>();
              const inFilters = new Map<string, unknown[]>();
              let executed = false;

              const applyUpdate = () => {
                if (executed) {
                  return state.queueRows.filter((row) =>
                    matchesFilters(row, eqFilters, inFilters)
                  );
                }

                executed = true;
                const updatedRows = state.queueRows.filter((row) =>
                  matchesFilters(row, eqFilters, inFilters)
                );
                for (const row of updatedRows) {
                  Object.assign(row, patch);
                }
                state.queueUpdates.push({
                  ids: updatedRows.map((row) => row.id),
                  patch,
                });
                return updatedRows;
              };

              const builder = {
                eq(field: string, value: unknown) {
                  eqFilters.set(field, value);
                  return builder;
                },
                in(field: string, value: unknown[]) {
                  inFilters.set(field, value);
                  return builder;
                },
                select: vi.fn(async () => ({
                  data: applyUpdate().map((row) => ({ id: row.id })),
                  error: null,
                })),
              };

              Object.defineProperty(builder, 'then', {
                value(onfulfilled: unknown, onrejected: unknown) {
                  applyUpdate();
                  return Promise.resolve({ error: null }).then(
                    onfulfilled as
                      | ((value: { error: null }) => unknown)
                      | undefined,
                    onrejected as ((reason: unknown) => unknown) | undefined
                  );
                },
              });

              return builder;
            }),
            upsert: vi.fn((rows: Record<string, unknown>[]) => ({
              select: vi.fn(async () => {
                const row = rows[0];
                if (!row) {
                  throw new Error('Expected at least one queue upsert row');
                }

                const existingRow = state.queueRows.find(
                  (queueRow) =>
                    queueRow.post_id === row.post_id &&
                    queueRow.user_id === row.user_id
                );

                if (existingRow) {
                  Object.assign(existingRow, row);
                  return { data: [existingRow], error: null };
                }

                const insertedRow = createQueueRow({
                  id: QUEUE_ID,
                  user_id: row.user_id as string,
                  attempt_count: row.attempt_count as number,
                  batch_id: row.batch_id as string | null,
                  blocked_reason: row.blocked_reason as string | null,
                  cancelled_at: row.cancelled_at as string | null,
                  claimed_at: row.claimed_at as string | null,
                  group_id: row.group_id as string,
                  last_attempt_at: row.last_attempt_at as string | null,
                  last_error: row.last_error as string | null,
                  post_id: row.post_id as string,
                  sender_platform_user_id:
                    row.sender_platform_user_id as string,
                  sent_at: row.sent_at as string | null,
                  sent_email_id: row.sent_email_id as string | null,
                  status: row.status as QueueRow['status'],
                  ws_id: row.ws_id as string,
                });
                state.queueRows.push(insertedRow);
                return { data: [insertedRow], error: null };
              }),
            })),
          };
        case 'user_group_posts':
          return {
            select: vi.fn(() => ({
              in: vi.fn(async (_field: string, values: string[]) => ({
                data: values.map((postId) => ({
                  content: 'Post content',
                  created_at: '2026-03-28T00:00:00.000Z',
                  group_id: GROUP_ID,
                  id: postId,
                  title: 'Post title',
                  workspace_user_groups: {
                    name: 'Group 1',
                    ws_id: WS_ID,
                  },
                })),
                error: null,
              })),
            })),
          };
        case 'user_group_post_checks':
          return {
            select: vi.fn(() => ({
              in(field: string, values: string[]) {
                const postIds =
                  field === 'post_id'
                    ? values
                    : checkRows.map((row) => row.post_id);
                const userIds =
                  field === 'user_id'
                    ? values
                    : checkRows.map((row) => row.user_id);

                return {
                  in: vi.fn(
                    async (nestedField: string, nestedValues: string[]) => ({
                      data: checkRows.filter((row) => {
                        const resolvedPostIds =
                          nestedField === 'post_id' ? nestedValues : postIds;
                        const resolvedUserIds =
                          nestedField === 'user_id' ? nestedValues : userIds;

                        return (
                          resolvedPostIds.includes(row.post_id) &&
                          resolvedUserIds.includes(row.user_id)
                        );
                      }),
                      error: null,
                    })
                  ),
                };
              },
            })),
            update: vi.fn((patch: Record<string, unknown>) => ({
              eq(field: string, value: unknown) {
                const eqFilters = new Map<string, unknown>([[field, value]]);
                return {
                  eq: vi.fn(async (nextField: string, nextValue: unknown) => {
                    eqFilters.set(nextField, nextValue);
                    const matchedRows = checkRows.filter((row) =>
                      matchesFilters(row, eqFilters, new Map())
                    );

                    for (const row of matchedRows) {
                      if (typeof patch.email_id === 'string') {
                        state.checkEmailUpdates.push({
                          email_id: patch.email_id,
                          post_id: row.post_id,
                          user_id: row.user_id,
                        });
                      }
                    }

                    return { error: null };
                  }),
                };
              },
            })),
          };
        case 'sent_emails':
          return {
            select: vi.fn(() => {
              const eqFilters = new Map<string, unknown>();
              const inFilters = new Map<string, unknown[]>();

              const builder = {
                eq(field: string, value: unknown) {
                  eqFilters.set(field, value);
                  return builder;
                },
                in(field: string, value: unknown[]) {
                  inFilters.set(field, value);
                  return builder;
                },
                order() {
                  return builder;
                },
                limit: vi.fn(async (limit: number) => ({
                  data: state.sentEmailRows
                    .filter((row) => matchesFilters(row, eqFilters, inFilters))
                    .slice(0, limit)
                    .map((row) => ({
                      created_at: row.created_at,
                      id: row.id,
                    })),
                  error: null,
                })),
              };

              Object.defineProperty(builder, 'then', {
                value(onfulfilled: unknown, onrejected: unknown) {
                  return Promise.resolve({
                    data: state.sentEmailRows
                      .filter((row) =>
                        matchesFilters(row, eqFilters, inFilters)
                      )
                      .map((row) => ({
                        created_at: row.created_at,
                        id: row.id,
                        post_id: row.post_id,
                        receiver_id: row.receiver_id,
                      })),
                    error: null,
                  }).then(
                    onfulfilled as
                      | ((value: { data: unknown[]; error: null }) => unknown)
                      | undefined,
                    onrejected as ((reason: unknown) => unknown) | undefined
                  );
                },
              });

              return builder;
            }),
            insert: sentEmailInsertMock,
          };
        case 'email_audit':
          return {
            select: vi.fn(() => {
              const eqFilters = new Map<string, unknown>();
              const inFilters = new Map<string, unknown[]>();
              const builder = {
                eq(field: string, value: unknown) {
                  eqFilters.set(field, value);
                  return builder;
                },
                in(field: string, value: unknown[]) {
                  inFilters.set(field, value);
                  return Promise.resolve({
                    data: emailAuditRows.filter((row) =>
                      matchesFilters(row, eqFilters, new Map([[field, value]]))
                    ),
                    error: null,
                  });
                },
              };
              return builder;
            }),
          };
        case 'workspace_email_credentials':
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    source_email: 'notifications@tuturuuu.com',
                    source_name: 'Tuturuuu',
                  },
                  error: null,
                })),
              })),
            })),
          };
        default:
          throw new Error(`Unexpected table ${table}`);
      }
    },
  };

  return {
    sbAdmin,
    sentEmailInsertMock,
    state,
  };
}

describe('post email batch processing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.emailServiceSendMock.mockReset();
    mocks.fromWorkspaceAdminMock.mockClear();
  });

  it('auto-skips blacklisted recipients before calling the email service', async () => {
    const { sbAdmin, state } = createSbAdminMock({
      blockedEmails: new Set([RECIPIENT_EMAIL]),
      checkRows: [
        createCheckRow({ user_id: USER_ID, userEmail: RECIPIENT_EMAIL }),
      ],
      queueRows: [],
    });

    const result = await sendPostEmailImmediately(sbAdmin as never, {
      wsId: WS_ID,
      groupId: GROUP_ID,
      postId: POST_ID,
      userId: USER_ID,
      senderPlatformUserId: SENDER_PLATFORM_USER_ID,
    });

    expect(result).toEqual({
      id: QUEUE_ID,
      status: 'skipped',
    });
    expect(mocks.fromWorkspaceAdminMock).toHaveBeenCalledWith(WS_ID);
    expect(mocks.emailServiceSendMock).not.toHaveBeenCalled();
    expect(state.queueUpdates).toContainEqual(
      expect.objectContaining({
        ids: [QUEUE_ID],
        patch: expect.objectContaining({
          batch_id: null,
          blocked_reason: 'blacklist',
          last_error: 'Blocked: blacklist',
          status: 'skipped',
        }),
      })
    );
  });

  it('marks the queue row as sent when provider delivery succeeds but sent email persistence fails', async () => {
    mocks.emailServiceSendMock.mockResolvedValue({
      auditId: 'audit-1',
      messageId: 'provider-1',
      success: true,
    });

    const { sbAdmin, sentEmailInsertMock, state } = createSbAdminMock({
      checkRows: [
        createCheckRow({ user_id: USER_ID, userEmail: 'user-1@example.com' }),
      ],
      failSentEmailInsert: true,
      queueRows: [],
    });

    const result = await sendPostEmailImmediately(sbAdmin as never, {
      wsId: WS_ID,
      groupId: GROUP_ID,
      postId: POST_ID,
      userId: USER_ID,
      senderPlatformUserId: SENDER_PLATFORM_USER_ID,
    });

    expect(result).toEqual({
      id: QUEUE_ID,
      status: 'sent',
    });
    expect(sentEmailInsertMock).toHaveBeenCalledTimes(1);
    expect(state.queueUpdates).toContainEqual(
      expect.objectContaining({
        ids: [QUEUE_ID],
        patch: expect.objectContaining({
          sent_email_id: null,
          status: 'sent',
        }),
      })
    );
    expect(
      state.queueUpdates.some(
        ({ patch }) =>
          patch.status === 'sent' &&
          typeof patch.last_error === 'string' &&
          patch.last_error.includes('provider-1')
      )
    ).toBe(true);
  });

  it('recovers queued rows from email audit without resending them', async () => {
    const queueRow = createQueueRow({ id: 'queue-1', user_id: USER_ID });
    const { sbAdmin, state } = createSbAdminMock({
      checkRows: [
        createCheckRow({ user_id: USER_ID, userEmail: 'user-1@example.com' }),
      ],
      emailAuditRows: [
        {
          created_at: '2026-03-28T00:10:00.000Z',
          entity_id: POST_ID,
          entity_type: 'post',
          html_content: '<html>audit</html>',
          id: 'audit-1',
          sent_at: '2026-03-28T00:11:00.000Z',
          source_email: 'notifications@tuturuuu.com',
          source_name: 'Tuturuuu',
          status: 'sent',
          subject: 'Recovered from audit',
          to_addresses: ['user-1@example.com'],
          user_id: SENDER_PLATFORM_USER_ID,
        },
      ],
      queueRows: [queueRow],
    });

    const result = await processPostEmailQueueBatch(sbAdmin as never, {
      concurrency: 1,
      limit: 1,
      maxDurationMs: 1_000,
      sendLimit: 1,
    });

    expect(result.claimed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results).toEqual([{ id: 'queue-1', status: 'sent' }]);
    expect(mocks.emailServiceSendMock).not.toHaveBeenCalled();
    expect(state.sentEmailRows).toHaveLength(1);
    expect(state.checkEmailUpdates).toContainEqual({
      email_id: 'sent-1',
      post_id: POST_ID,
      user_id: USER_ID,
    });
  });

  it('only claims rows that it can start before the batch time budget expires', async () => {
    let currentTime = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => currentTime);

    mocks.emailServiceSendMock.mockImplementation(async () => {
      currentTime = 10;
      return { success: true };
    });

    const { sbAdmin, state } = createSbAdminMock({
      checkRows: [
        createCheckRow({ user_id: USER_ID, userEmail: 'user-1@example.com' }),
        createCheckRow({ user_id: USER_ID_2, userEmail: 'user-2@example.com' }),
      ],
      queueRows: [
        createQueueRow({ id: 'queue-1', user_id: USER_ID }),
        createQueueRow({ id: 'queue-2', user_id: USER_ID_2 }),
      ],
    });

    const result = await processPostEmailQueueBatch(sbAdmin as never, {
      concurrency: 1,
      limit: 2,
      maxDurationMs: 5,
      sendLimit: 2,
    });

    expect(result.claimed).toBe(1);
    expect(result.processed).toBe(1);
    expect(
      state.queueUpdates.filter(({ patch }) => patch.status === 'processing')
    ).toHaveLength(1);
    expect(state.queueRows.find((row) => row.id === 'queue-2')?.status).toBe(
      'queued'
    );
  });

  it('builds the post email subject with accented Vietnamese', () => {
    expect(
      buildPostEmailSubject('2026-03-08T00:00:00.000Z', 'Võ Bảo Ngọc 2')
    ).toBe('Easy Center | Báo cáo tiến độ ngày 08/03/2026 của Võ Bảo Ngọc 2');
  });
});
