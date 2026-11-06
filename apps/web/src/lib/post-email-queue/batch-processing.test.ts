import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const emailServiceSendMock = vi.fn();
  const fromWorkspaceMock = vi.fn(async () => ({
    send: emailServiceSendMock,
  }));
  const fromWorkspaceAdminMock = vi.fn(async () => ({
    send: emailServiceSendMock,
  }));

  class MockEmailService {
    static fromWorkspace = fromWorkspaceMock;
    static fromWorkspaceAdmin = fromWorkspaceAdminMock;
  }

  return {
    EmailService: MockEmailService,
    emailServiceSendMock,
    fromWorkspaceMock,
    fromWorkspaceAdminMock,
  };
});

vi.mock('@react-email/render', () => ({
  render: vi.fn(async () => '<html />'),
}));

vi.mock('@tuturuuu/email-service', () => ({
  EmailService: mocks.EmailService,
}));

vi.mock('@/components/email/templates/default-email-template', () => ({
  default: vi.fn(() => null),
}));

import {
  processPostEmailQueueBatch,
  sendPostEmailImmediately,
} from '@/lib/post-email-queue';
import { buildPostEmailSubject } from './batch-processing';

import {
  createCheckRow,
  createQueueRow,
  createSbAdminMock,
  GROUP_ID,
  POST_ID,
  QUEUE_ID,
  RECIPIENT_EMAIL,
  SENDER_PLATFORM_USER_ID,
  USER_ID,
  USER_ID_2,
  WS_ID,
} from './batch-test-utils';

describe('post email batch processing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.emailServiceSendMock.mockReset();
    mocks.fromWorkspaceMock.mockClear();
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
    expect(mocks.fromWorkspaceMock).toHaveBeenCalledWith(WS_ID);
    expect(mocks.fromWorkspaceAdminMock).not.toHaveBeenCalled();
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

  it('records rate-limited sends as failed queue rows', async () => {
    mocks.emailServiceSendMock.mockResolvedValue({
      error: 'Rate limit exceeded',
      rateLimitInfo: {
        allowed: false,
        limitType: 'workspace_day',
        reason: 'Workspace daily email limit reached',
        remaining: 0,
        retryAfter: 3600,
      },
      success: false,
    });

    const { sbAdmin, state } = createSbAdminMock({
      checkRows: [
        createCheckRow({ user_id: USER_ID, userEmail: 'user-1@example.com' }),
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
      status: 'failed',
    });
    expect(mocks.fromWorkspaceMock).toHaveBeenCalledWith(WS_ID);
    expect(mocks.fromWorkspaceAdminMock).not.toHaveBeenCalled();
    expect(state.queueUpdates).toContainEqual(
      expect.objectContaining({
        ids: [QUEUE_ID],
        patch: expect.objectContaining({
          blocked_reason: null,
          last_error: 'Workspace daily email limit reached',
          status: 'failed',
        }),
      })
    );
  });

  it('cancels inactive queued recipients before calling the email service', async () => {
    const queueRow = createQueueRow({ id: QUEUE_ID, user_id: USER_ID });
    const { sbAdmin, state } = createSbAdminMock({
      checkRows: [
        createCheckRow({
          user_id: USER_ID,
          userEmail: 'user-1@example.com',
          user: {
            archived: false,
            archived_until: '2999-01-01T00:00:00.000Z',
            display_name: 'Recipient',
            email: 'user-1@example.com',
            full_name: 'Recipient',
            id: USER_ID,
          },
        }),
      ],
      queueRows: [queueRow],
    });

    const result = await processPostEmailQueueBatch(sbAdmin as never, {
      concurrency: 1,
      limit: 1,
      maxDurationMs: 1_000,
      sendLimit: 1,
    });

    expect(result.results).toEqual([{ id: QUEUE_ID, status: 'cancelled' }]);
    expect(mocks.emailServiceSendMock).not.toHaveBeenCalled();
    expect(state.queueUpdates).toContainEqual(
      expect.objectContaining({
        ids: [QUEUE_ID],
        patch: expect.objectContaining({
          status: 'cancelled',
          last_error:
            'Post is no longer approved or recipient is no longer eligible.',
        }),
      })
    );
  });

  it('does not send a row that is cancelled after the batch claims it', async () => {
    mocks.emailServiceSendMock.mockResolvedValue({
      messageId: 'provider-1',
      success: true,
    });

    const queueRow = createQueueRow({ id: QUEUE_ID, user_id: USER_ID });
    const { sbAdmin, state } = createSbAdminMock({
      checkRows: [
        createCheckRow({ user_id: USER_ID, userEmail: 'user-1@example.com' }),
      ],
      onQueueUpdate: ({ patch, updatedRows }) => {
        if (patch.status !== 'processing') return;

        for (const row of updatedRows) {
          row.status = 'cancelled';
          row.batch_id = null;
          row.claimed_at = null;
          row.cancelled_at = '2026-03-28T00:03:00.000Z';
          row.last_error = 'Recipient is archived or temporarily archived.';
        }
      },
      queueRows: [queueRow],
    });

    const result = await processPostEmailQueueBatch(sbAdmin as never, {
      concurrency: 1,
      limit: 1,
      maxDurationMs: 1_000,
      sendLimit: 1,
    });

    expect(result.results).toEqual([{ id: QUEUE_ID, status: 'cancelled' }]);
    expect(mocks.emailServiceSendMock).not.toHaveBeenCalled();
    expect(state.queueRows.find((row) => row.id === QUEUE_ID)).toMatchObject({
      status: 'cancelled',
      batch_id: null,
      claimed_at: null,
      last_error: 'Recipient is archived or temporarily archived.',
    });
    expect(
      state.queueUpdates.some(({ patch }) => patch.status === 'sent')
    ).toBe(false);
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

  it('formats the post email subject in the workspace timezone', () => {
    const createdAt = '2026-03-07T18:30:00.000Z';

    expect(
      buildPostEmailSubject(createdAt, 'Võ Bảo Ngọc 2', 'Asia/Ho_Chi_Minh')
    ).toBe('Easy Center | Báo cáo tiến độ ngày 08/03/2026 của Võ Bảo Ngọc 2');
    expect(
      buildPostEmailSubject(createdAt, 'Võ Bảo Ngọc 2', 'America/New_York')
    ).toBe('Easy Center | Báo cáo tiến độ ngày 07/03/2026 của Võ Bảo Ngọc 2');
  });

  it('falls back to Vietnam time when the workspace timezone is missing or invalid', () => {
    const createdAt = '2026-03-07T18:30:00.000Z';

    expect(buildPostEmailSubject(createdAt, 'Võ Bảo Ngọc 2')).toBe(
      'Easy Center | Báo cáo tiến độ ngày 08/03/2026 của Võ Bảo Ngọc 2'
    );
    expect(
      buildPostEmailSubject(createdAt, 'Võ Bảo Ngọc 2', 'Invalid/Timezone')
    ).toBe('Easy Center | Báo cáo tiến độ ngày 08/03/2026 của Võ Bảo Ngọc 2');
  });

  it('uses the prefetched workspace timezone when sending post emails', async () => {
    mocks.emailServiceSendMock.mockResolvedValue({
      messageId: 'provider-1',
      success: true,
    });

    const { sbAdmin, state } = createSbAdminMock({
      checkRows: [
        createCheckRow({ user_id: USER_ID, userEmail: 'user-1@example.com' }),
      ],
      postCreatedAt: '2026-03-07T18:30:00.000Z',
      queueRows: [createQueueRow({ id: QUEUE_ID, user_id: USER_ID })],
      workspaceTimezone: 'Asia/Ho_Chi_Minh',
    });

    const result = await processPostEmailQueueBatch(sbAdmin as never, {
      concurrency: 1,
      limit: 1,
      maxDurationMs: 1_000,
      sendLimit: 1,
    });

    expect(result.results).toEqual([{ id: QUEUE_ID, status: 'sent' }]);
    expect(mocks.emailServiceSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          subject:
            'Easy Center | Báo cáo tiến độ ngày 08/03/2026 của Recipient',
        }),
      })
    );
    expect(state.sentEmailRows[0]?.subject).toBe(
      'Easy Center | Báo cáo tiến độ ngày 08/03/2026 của Recipient'
    );
  });
});
