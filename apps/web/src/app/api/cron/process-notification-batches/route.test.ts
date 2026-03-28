import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const fromMock = vi.fn();
  const pushDeleteInMock = vi.fn();
  const rpcMock = vi.fn();
  const sendPushNotificationBatchMock = vi.fn();
  const sendSystemEmailMock = vi.fn();

  return {
    fromMock,
    pushDeleteInMock,
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
    lte: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    or: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
  };

  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(result));
  chain.lte = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.or = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.range = vi.fn(() => Promise.resolve(result));
  chain.select = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(result));

  return chain;
}

import { GET } from './route';

describe('process-notification-batches route', () => {
  let batches: Array<{
    channel: string;
    email: string | null;
    id: string;
    user_id: string | null;
    window_end: string;
    window_start: string;
    ws_id: string | null;
  }>;
  let deliveryLogs: Array<{
    batch_id: string;
    id: string;
    notification_id: string;
    notifications: {
      created_at: string;
      data: { board_id?: string; workspace_id: string };
      description: string;
      entity_id: string;
      entity_type: string;
      id: string;
      scope: string;
      title: string;
      type: string;
      user_id: string;
      ws_id: string;
    };
  }>;
  let workspaceMembership: { user_id: string } | null;
  let blockedEmails: Set<string>;
  let users: Array<{
    display_name: string;
    email: Array<{ email: string }> | null;
    id: string;
  }>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    mocks.sendPushNotificationBatchMock.mockResolvedValue({
      deliveredCount: 1,
      invalidTokens: ['stale-token'],
    });
    blockedEmails = new Set<string>();
    mocks.rpcMock.mockImplementation(
      async (_name: string, args: { p_emails: string[] }) => ({
        data: args.p_emails.map((email) => ({
          email,
          is_blocked: blockedEmails.has(email),
          reason: null,
        })),
        error: null,
      })
    );
    mocks.sendSystemEmailMock.mockResolvedValue({
      success: true,
    });

    batches = [
      {
        channel: 'push',
        email: null,
        id: 'batch-1',
        user_id: 'user-1',
        window_end: '2026-03-28T00:05:00.000Z',
        window_start: '2026-03-28T00:00:00.000Z',
        ws_id: ROOT_WORKSPACE_ID,
      },
    ];
    deliveryLogs = [
      {
        batch_id: 'batch-1',
        id: 'log-1',
        notification_id: 'notification-1',
        notifications: {
          created_at: '2026-03-28T00:00:00.000Z',
          data: { board_id: 'board-1', workspace_id: ROOT_WORKSPACE_ID },
          description: 'Security alert',
          entity_id: 'task-1',
          entity_type: 'task',
          id: 'notification-1',
          scope: 'workspace',
          title: 'Security alert',
          type: 'security_alert',
          user_id: 'user-1',
          ws_id: ROOT_WORKSPACE_ID,
        },
      },
    ];
    workspaceMembership = { user_id: 'user-1' };
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
              createResolvedChain({ data: null, error: null })
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
              createResolvedChain({ data: null, error: null })
            ),
          };
        case 'notification_push_devices':
          return {
            delete: vi.fn(() => ({
              in: mocks.pushDeleteInMock.mockResolvedValue({ error: null }),
            })),
            select: vi.fn(() =>
              createResolvedChain({
                data: [{ token: 'token-1' }, { token: 'stale-token' }],
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
                data: { name: 'Root Workspace' },
                error: null,
              })
            ),
          };
        default:
          throw new Error(`Unexpected table ${table}`);
      }
    });
  });

  it('processes batched push deliveries and removes invalid tokens', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/cron/process-notification-batches',
        {
          headers: {
            authorization: 'Bearer cron-secret',
          },
        }
      )
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
          notification_count: 1,
          status: 'sent',
        }),
      ],
    });
    expect(mocks.sendPushNotificationBatchMock).toHaveBeenCalledWith({
      devices: [{ token: 'token-1' }, { token: 'stale-token' }],
      notification: expect.objectContaining({
        data: expect.objectContaining({
          board_id: null,
          workspace_id: ROOT_WORKSPACE_ID,
        }),
        entity_id: null,
        entity_type: null,
        id: 'notification-1',
      }),
    });
    expect(mocks.pushDeleteInMock).toHaveBeenCalledWith('token', [
      'stale-token',
    ]);
  });

  it('drains fully stale batches as skipped', async () => {
    deliveryLogs[0]!.notifications.created_at = '2026-03-26T00:00:00.000Z';

    const response = await GET(
      new NextRequest(
        'http://localhost/api/cron/process-notification-batches',
        {
          headers: {
            authorization: 'Bearer cron-secret',
          },
        }
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      failed: 0,
      processed: 1,
      results: [
        expect.objectContaining({
          batch_id: 'batch-1',
          channel: 'push',
          notification_count: 1,
          reason: 'all_notifications_skipped',
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
              createResolvedChain({ data: null, error: null })
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
              createResolvedChain({ data: null, error: null })
            ),
          };
        case 'notification_push_devices':
          return {
            delete: vi.fn(() => ({
              in: mocks.pushDeleteInMock.mockResolvedValue({ error: null }),
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
                data: { name: 'Root Workspace' },
                error: null,
              })
            ),
          };
        default:
          throw new Error(`Unexpected table ${table}`);
      }
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/cron/process-notification-batches',
        {
          headers: {
            authorization: 'Bearer cron-secret',
          },
        }
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      failed: 0,
      processed: 1,
      results: [
        expect.objectContaining({
          batch_id: 'batch-1',
          channel: 'push',
          notification_count: 1,
          reason: 'skipped: no_registered_push_devices',
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

    const response = await GET(
      new NextRequest(
        'http://localhost/api/cron/process-notification-batches',
        {
          headers: {
            authorization: 'Bearer cron-secret',
          },
        }
      )
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

    const response = await GET(
      new NextRequest(
        'http://localhost/api/cron/process-notification-batches',
        {
          headers: {
            authorization: 'Bearer cron-secret',
          },
        }
      )
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

    const response = await GET(
      new NextRequest(
        'http://localhost/api/cron/process-notification-batches',
        {
          headers: {
            authorization: 'Bearer cron-secret',
          },
        }
      )
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

  it('drains more than the old 50-batch cap in one run', async () => {
    batches = Array.from({ length: 51 }, (_, index) => ({
      channel: 'push',
      email: null,
      id: `batch-${index + 1}`,
      user_id: 'user-1',
      window_end: '2026-03-28T00:05:00.000Z',
      window_start: '2026-03-28T00:00:00.000Z',
      ws_id: ROOT_WORKSPACE_ID,
    }));
    deliveryLogs = batches.map((batch, index) => ({
      batch_id: batch.id,
      id: `log-${index + 1}`,
      notification_id: `notification-${index + 1}`,
      notifications: {
        created_at: '2026-03-28T00:00:00.000Z',
        data: { workspace_id: ROOT_WORKSPACE_ID },
        description: `Notification ${index + 1}`,
        entity_id: `task-${index + 1}`,
        entity_type: 'task',
        id: `notification-${index + 1}`,
        scope: 'workspace',
        title: `Notification ${index + 1}`,
        type: 'security_alert',
        user_id: 'user-1',
        ws_id: ROOT_WORKSPACE_ID,
      },
    }));

    const response = await GET(
      new NextRequest(
        'http://localhost/api/cron/process-notification-batches',
        {
          headers: {
            authorization: 'Bearer cron-secret',
          },
        }
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      failed: 0,
      processed: 51,
    });
  });
});
