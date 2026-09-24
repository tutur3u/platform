import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRecentNotificationWindow,
  getStaleCreatedAt,
} from './test-window';

const mocks = vi.hoisted(() => {
  const fromMock = vi.fn();
  const rpcMock = vi.fn();
  const sendPushNotificationBatchMock = vi.fn();
  const sendSystemEmailMock = vi.fn();
  const statusError = vi.fn((): Error | null => null);

  return {
    fromMock,
    statusError,
    rpcMock,
    sendPushNotificationBatchMock,
    sendSystemEmailMock,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() =>
    Promise.resolve({
      from: mocks.fromMock,
      rpc: mocks.rpcMock,
      schema: vi.fn((schemaName: string) => {
        if (schemaName !== 'private') {
          throw new Error(`Unexpected schema ${schemaName}`);
        }

        return {
          rpc: mocks.rpcMock,
          from: mocks.fromMock,
        };
      }),
    })
  ),
}));

vi.mock('@/lib/notifications/push-delivery', () => ({
  sendPushNotificationBatch: mocks.sendPushNotificationBatchMock,
}));

vi.mock('@react-email/render', () => ({
  render: vi.fn(async () => '<html />'),
}));

vi.mock('@tuturuuu/email-service', () => ({
  sendSystemEmail: mocks.sendSystemEmailMock,
}));

function createResolvedChain<T>(result: T) {
  const chain = Promise.resolve(result) as Promise<T> & {
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
  };

  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(result));
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.order = vi.fn(() => chain);
  chain.range = vi.fn(() => Promise.resolve(result));
  chain.select = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(result));

  return chain;
}

import { POST } from './route';

describe('send-immediate route', () => {
  let batches: Array<{
    channel: string;
    email: string | null;
    id: string;
    user_id: string | null;
    window_end: string;
    ws_id: string | null;
  }>;
  let deliveryLogs: Array<{
    batch_id: string;
    id: string;
    notification_id: string;
    notifications: {
      code: null;
      created_at: string;
      data: Record<string, string>;
      description: string;
      entity_id: string;
      entity_type: string;
      id: string;
      scope: string;
      title: string;
      type: string;
      user_id: string;
      ws_id: string | null;
    };
  }>;
  let workspaceMembership: { type: 'MEMBER' } | null;
  let blockedEmails: Set<string>;
  let users: Array<{
    display_name: string;
    email: Array<{ email: string }>;
    id: string;
  }>;

  beforeEach(() => {
    mocks.statusError.mockReturnValue(null);
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    const recentWindow = createRecentNotificationWindow();
    blockedEmails = new Set<string>();
    mocks.rpcMock.mockImplementation(
      async (
        name: string,
        args: { p_emails?: string[]; p_notification_types?: string[] }
      ) => {
        if (name === 'list_immediate_notification_email_configs') {
          return { data: [], error: null };
        }

        if (name === 'get_email_block_statuses') {
          return {
            data: (args.p_emails ?? []).map((email) => ({
              email,
              is_blocked: blockedEmails.has(email),
              reason: null,
            })),
            error: null,
          };
        }

        throw new Error(`Unexpected RPC ${name}`);
      }
    );
    mocks.sendPushNotificationBatchMock.mockResolvedValue({
      deliveredCount: 1,
      invalidTokens: [],
    });
    mocks.sendSystemEmailMock.mockResolvedValue({
      success: true,
    });

    batches = [
      {
        channel: 'push',
        email: null,
        id: 'batch-1',
        user_id: 'user-1',
        window_end: recentWindow.window_end,
        ws_id: ROOT_WORKSPACE_ID,
      },
    ];
    deliveryLogs = [
      {
        batch_id: 'batch-1',
        id: 'log-1',
        notification_id: 'notification-1',
        notifications: {
          code: null,
          created_at: recentWindow.created_at,
          data: { board_id: 'board-1', workspace_id: ROOT_WORKSPACE_ID },
          description: 'You were mentioned',
          entity_id: 'task-1',
          entity_type: 'task',
          id: 'notification-1',
          scope: 'workspace',
          title: 'Task mention',
          type: 'task_mention',
          user_id: 'user-1',
          ws_id: ROOT_WORKSPACE_ID,
        },
      },
    ];
    workspaceMembership = { type: 'MEMBER' };
    users = [
      {
        display_name: 'User One',
        email: [{ email: 'member@tuturuuu.com' }],
        id: 'user-1',
      },
    ];

    mocks.fromMock.mockImplementation((table: string) => {
      switch (table) {
        case 'notification_batches':
          return {
            select: vi.fn(() =>
              createResolvedChain({ data: batches, error: null })
            ),
            update: vi.fn(() =>
              createResolvedChain({ data: [{ id: 'claimed' }], error: null })
            ),
          };
        case 'notification_delivery_log':
          return {
            select: vi.fn(() =>
              createResolvedChain({
                data: deliveryLogs,
                error: null,
              })
            ),
            update: vi.fn(() =>
              createResolvedChain({ data: null, error: mocks.statusError() })
            ),
          };
        case 'notifications':
          return {
            select: vi.fn(() =>
              createResolvedChain({
                data: deliveryLogs.map((log) => log.notifications),
                error: null,
              })
            ),
          };
        case 'users':
          return {
            select: vi.fn(() =>
              createResolvedChain({
                data: users,
                error: null,
              })
            ),
          };
        case 'workspaces':
          return {
            select: vi.fn(() =>
              createResolvedChain({
                data: [{ id: ROOT_WORKSPACE_ID, name: 'Root Workspace' }],
                error: null,
              })
            ),
          };
        case 'notification_push_devices':
          return {
            delete: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({ error: null }),
            })),
            select: vi.fn(() =>
              createResolvedChain({
                data: [{ token: 'token-1', user_id: 'user-1' }],
                error: null,
              })
            ),
          };
        case 'workspace_members':
          return {
            select: vi.fn(() =>
              createResolvedChain({
                data: workspaceMembership,
                error: null,
              })
            ),
          };
        default:
          throw new Error(`Unexpected table ${table}`);
      }
    });
  });

  it('sends immediate push batches through FCM', async () => {
    const response = await POST(
      new Request('http://localhost/api/notifications/send-immediate', {
        body: JSON.stringify({ batch_id: 'batch-1' }),
        headers: {
          authorization: 'Bearer cron-secret',
        },
        method: 'POST',
      }) as any
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      failed: 0,
      processed: 1,
      results: [
        expect.objectContaining({
          batch_id: 'batch-1',
          channel: 'push',
          delivered_count: 1,
          status: 'sent',
        }),
      ],
    });
    expect(mocks.sendPushNotificationBatchMock).toHaveBeenCalledWith({
      devices: [{ token: 'token-1' }],
      notification: expect.objectContaining({
        entity_id: 'task-1',
        entity_type: 'task',
        id: 'notification-1',
        title: 'Task mention',
      }),
    });
  });

  it('delivers push to a member outside the root workspace', async () => {
    const otherWorkspaceId = '00000000-0000-4000-8000-000000000222';
    batches[0]!.ws_id = otherWorkspaceId;
    deliveryLogs[0]!.notifications.ws_id = otherWorkspaceId;
    deliveryLogs[0]!.notifications.data.workspace_id = otherWorkspaceId;

    const response = await POST(
      new Request('http://localhost/api/notifications/send-immediate', {
        body: JSON.stringify({ batch_id: 'batch-1' }),
        headers: { authorization: 'Bearer cron-secret' },
        method: 'POST',
      }) as any
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      processed: 1,
      results: [expect.objectContaining({ status: 'sent' })],
    });
    expect(mocks.sendPushNotificationBatchMock).toHaveBeenCalledOnce();
  });

  it('keeps non-root email batches out of the push rollout', async () => {
    const otherWorkspaceId = '00000000-0000-4000-8000-000000000222';
    batches[0]!.channel = 'email';
    batches[0]!.ws_id = otherWorkspaceId;
    deliveryLogs[0]!.notifications.ws_id = otherWorkspaceId;

    const response = await POST(
      new Request('http://localhost/api/notifications/send-immediate', {
        body: JSON.stringify({ batch_id: 'batch-1' }),
        headers: { authorization: 'Bearer cron-secret' },
        method: 'POST',
      }) as any
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ processed: 0 });
    expect(mocks.sendSystemEmailMock).not.toHaveBeenCalled();
  });

  it('skips notifications older than one day', async () => {
    deliveryLogs[0]!.notifications.created_at = getStaleCreatedAt();

    const response = await POST(
      new Request('http://localhost/api/notifications/send-immediate', {
        body: JSON.stringify({ batch_id: 'batch-1' }),
        headers: {
          authorization: 'Bearer cron-secret',
        },
        method: 'POST',
      }) as any
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      failed: 0,
      processed: 1,
      results: [
        expect.objectContaining({
          batch_id: 'batch-1',
          channel: 'push',
          delivered_count: 0,
          status: 'skipped',
        }),
      ],
    });
    expect(mocks.sendPushNotificationBatchMock).not.toHaveBeenCalled();
  });

  it('skips workspace notifications for removed members', async () => {
    const otherWorkspaceId = '00000000-0000-4000-8000-000000000222';
    batches[0]!.ws_id = otherWorkspaceId;
    deliveryLogs[0]!.notifications.ws_id = otherWorkspaceId;
    deliveryLogs[0]!.notifications.data.workspace_id = otherWorkspaceId;
    workspaceMembership = null;

    const response = await POST(
      new Request('http://localhost/api/notifications/send-immediate', {
        body: JSON.stringify({ batch_id: 'batch-1' }),
        headers: {
          authorization: 'Bearer cron-secret',
        },
        method: 'POST',
      }) as any
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      failed: 0,
      processed: 1,
      results: [
        expect.objectContaining({
          batch_id: 'batch-1',
          channel: 'push',
          delivered_count: 0,
          status: 'skipped',
        }),
      ],
    });
    expect(mocks.sendPushNotificationBatchMock).not.toHaveBeenCalled();
  });

  it('skips push batches when the user has no registered devices', async () => {
    mocks.fromMock.mockImplementation((table: string) => {
      switch (table) {
        case 'notification_batches':
          return {
            select: vi.fn(() =>
              createResolvedChain({ data: batches, error: null })
            ),
            update: vi.fn(() =>
              createResolvedChain({ data: [{ id: 'claimed' }], error: null })
            ),
          };
        case 'notification_delivery_log':
          return {
            select: vi.fn(() =>
              createResolvedChain({
                data: deliveryLogs,
                error: null,
              })
            ),
            update: vi.fn(() =>
              createResolvedChain({ data: null, error: mocks.statusError() })
            ),
          };
        case 'notifications':
          return {
            select: vi.fn(() =>
              createResolvedChain({
                data: deliveryLogs.map((log) => log.notifications),
                error: null,
              })
            ),
          };
        case 'users':
          return {
            select: vi.fn(() =>
              createResolvedChain({
                data: users,
                error: null,
              })
            ),
          };
        case 'workspaces':
          return {
            select: vi.fn(() =>
              createResolvedChain({
                data: [{ id: ROOT_WORKSPACE_ID, name: 'Root Workspace' }],
                error: null,
              })
            ),
          };
        case 'notification_push_devices':
          return {
            delete: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({ error: null }),
            })),
            select: vi.fn(() =>
              createResolvedChain({
                data: [],
                error: null,
              })
            ),
          };
        case 'workspace_members':
          return {
            select: vi.fn(() =>
              createResolvedChain({
                data: workspaceMembership,
                error: null,
              })
            ),
          };
        default:
          throw new Error(`Unexpected table ${table}`);
      }
    });

    const response = await POST(
      new Request('http://localhost/api/notifications/send-immediate', {
        body: JSON.stringify({ batch_id: 'batch-1' }),
        headers: {
          authorization: 'Bearer cron-secret',
        },
        method: 'POST',
      }) as any
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      failed: 0,
      processed: 1,
      results: [
        expect.objectContaining({
          batch_id: 'batch-1',
          channel: 'push',
          delivered_count: 0,
          status: 'skipped',
        }),
      ],
    });
    expect(mocks.sendPushNotificationBatchMock).not.toHaveBeenCalled();
  });

  it('skips external-recipient email batches before send', async () => {
    batches[0] = {
      ...batches[0]!,
      channel: 'email',
    };
    users[0]!.email = [{ email: 'member@example.com' }];

    const response = await POST(
      new Request('http://localhost/api/notifications/send-immediate', {
        body: JSON.stringify({ batch_id: 'batch-1' }),
        headers: {
          authorization: 'Bearer cron-secret',
        },
        method: 'POST',
      }) as any
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      failed: 0,
      processed: 1,
      results: [
        expect.objectContaining({
          batch_id: 'batch-1',
          channel: 'email',
          status: 'skipped',
        }),
      ],
    });
    expect(mocks.sendSystemEmailMock).not.toHaveBeenCalled();
  });

  it('marks blocked email batches as skipped instead of failed', async () => {
    batches[0] = {
      ...batches[0]!,
      channel: 'email',
    };
    mocks.sendSystemEmailMock.mockResolvedValueOnce({
      blockedRecipients: [
        {
          details: 'blacklist',
          email: 'member@tuturuuu.com',
          reason: 'blacklist',
        },
      ],
      error: 'All recipients blocked or rate limited',
      success: false,
    });

    const response = await POST(
      new Request('http://localhost/api/notifications/send-immediate', {
        body: JSON.stringify({ batch_id: 'batch-1' }),
        headers: {
          authorization: 'Bearer cron-secret',
        },
        method: 'POST',
      }) as any
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      failed: 0,
      processed: 1,
      results: [
        expect.objectContaining({
          batch_id: 'batch-1',
          channel: 'email',
          status: 'skipped',
        }),
      ],
    });
  });

  it('skips blacklisted email batches before send', async () => {
    batches[0] = {
      ...batches[0]!,
      channel: 'email',
    };
    blockedEmails.add('member@tuturuuu.com');

    const response = await POST(
      new Request('http://localhost/api/notifications/send-immediate', {
        body: JSON.stringify({ batch_id: 'batch-1' }),
        headers: {
          authorization: 'Bearer cron-secret',
        },
        method: 'POST',
      }) as any
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      failed: 0,
      processed: 1,
      results: [
        expect.objectContaining({
          batch_id: 'batch-1',
          channel: 'email',
          status: 'skipped',
        }),
      ],
    });
    expect(mocks.sendSystemEmailMock).not.toHaveBeenCalled();
  });

  it('drains more than the old 20-batch cap in one run', async () => {
    const recentWindow = createRecentNotificationWindow();
    batches = Array.from({ length: 21 }, (_, index) => ({
      channel: 'push',
      email: null,
      id: `batch-${index + 1}`,
      user_id: 'user-1',
      window_end: recentWindow.window_end,
      ws_id: ROOT_WORKSPACE_ID,
    }));
    deliveryLogs = batches.map((batch, index) => ({
      batch_id: batch.id,
      id: `log-${index + 1}`,
      notification_id: `notification-${index + 1}`,
      notifications: {
        code: null,
        created_at: recentWindow.created_at,
        data: { workspace_id: ROOT_WORKSPACE_ID },
        description: `Notification ${index + 1}`,
        entity_id: `task-${index + 1}`,
        entity_type: 'task',
        id: `notification-${index + 1}`,
        scope: 'workspace',
        title: `Notification ${index + 1}`,
        type: 'task_mention',
        user_id: 'user-1',
        ws_id: ROOT_WORKSPACE_ID,
      },
    }));

    const response = await POST(
      new Request('http://localhost/api/notifications/send-immediate', {
        headers: {
          authorization: 'Bearer cron-secret',
        },
        method: 'POST',
      }) as any
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      failed: 0,
      processed: 21,
    });
  });
  it.each([true, false])(
    'delivers personal Mail only with current access (%s)',
    async (allowed) => {
      batches[0]!.ws_id = null;
      Object.assign(deliveryLogs[0]!.notifications, {
        type: 'mail_received',
        scope: 'user',
        ws_id: null,
        entity_type: 'mail_message',
        entity_id: 'message-1',
        data: {
          userId: 'user-1',
          messageId: 'message-1',
          mailboxId: 'mailbox-1',
          threadId: 'thread-1',
        },
      });
      const previous = mocks.rpcMock.getMockImplementation()!;
      mocks.rpcMock.mockImplementation((name, args) =>
        name === 'can_deliver_mail_notification'
          ? Promise.resolve({ data: allowed, error: null })
          : previous(name, args)
      );
      const response = await POST(
        new Request('http://localhost/api/notifications/send-immediate', {
          method: 'POST',
          headers: { authorization: 'Bearer cron-secret' },
        }) as any
      );
      expect(response.status).toBe(200);
      expect(mocks.sendPushNotificationBatchMock).toHaveBeenCalledTimes(
        allowed ? 1 : 0
      );
      expect(mocks.sendSystemEmailMock).not.toHaveBeenCalled();
      await expect(response.json()).resolves.toMatchObject({
        processed: 1,
        failed: 0,
      });
    }
  );
  it('does not retry a delivered push when persistence fails', async () => {
    mocks.statusError.mockReturnValue(new Error('write unavailable'));
    const response = await POST(
      new Request('http://localhost/api/notifications/send-immediate', {
        method: 'POST',
        headers: { authorization: 'Bearer cron-secret' },
      }) as Parameters<typeof POST>[0]
    );
    const body = await response.json();
    expect(mocks.sendPushNotificationBatchMock).toHaveBeenCalledOnce();
    expect(body.failed).toBe(1);
    expect(body.results[0].status).toBe('reconciliation_required');
  });
  it.each(['email', 'push'])(
    'does not replay an ambiguous %s provider result',
    async (channel) => {
      batches[0] = { ...batches[0]!, channel };
      mocks.sendPushNotificationBatchMock.mockResolvedValueOnce({
        deliveredCount: 0,
        invalidTokens: [],
      });
      mocks.sendSystemEmailMock.mockResolvedValueOnce({
        success: false,
        error: 'Request timed out',
      });
      const response = await POST(
        new Request('http://localhost/api/notifications/send-immediate', {
          method: 'POST',
          headers: { authorization: 'Bearer cron-secret' },
        }) as Parameters<typeof POST>[0]
      );
      const body = await response.json();
      expect(
        channel === 'email'
          ? mocks.sendSystemEmailMock
          : mocks.sendPushNotificationBatchMock
      ).toHaveBeenCalledOnce();
      expect(body.results[0].status).toBe('reconciliation_required');
    }
  );
});
