import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const fromMock = vi.fn();
  const pushDeleteInMock = vi.fn();
  const sendPushNotificationBatchMock = vi.fn();

  return {
    fromMock,
    pushDeleteInMock,
    sendPushNotificationBatchMock,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() =>
    Promise.resolve({
      from: mocks.fromMock,
    })
  ),
}));

vi.mock('@/lib/notifications/push-delivery', () => ({
  sendPushNotificationBatch: mocks.sendPushNotificationBatchMock,
}));

vi.mock('@react-email/render', () => ({
  render: vi.fn(),
}));

vi.mock('@tuturuuu/email-service', () => ({
  sendSystemEmail: vi.fn(),
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
  chain.select = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(result));

  return chain;
}

import { GET } from './route';

describe('process-notification-batches push processor', () => {
  let batch: {
    channel: string;
    email: null;
    id: string;
    user_id: string;
    window_end: string;
    window_start: string;
    ws_id: string;
  };
  let deliveryLogs: Array<{
    id: string;
    notification_id: string;
    notifications: {
      created_at: string;
      data: { board_id: string; workspace_id: string };
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    mocks.sendPushNotificationBatchMock.mockResolvedValue({
      deliveredCount: 1,
      invalidTokens: ['stale-token'],
    });

    batch = {
      channel: 'push',
      email: null,
      id: 'batch-1',
      user_id: 'user-1',
      window_end: '2026-03-28T00:05:00.000Z',
      window_start: '2026-03-28T00:00:00.000Z',
      ws_id: ROOT_WORKSPACE_ID,
    };
    const notification = {
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
    };
    deliveryLogs = [
      {
        id: 'log-1',
        notification_id: notification.id,
        notifications: notification,
      },
    ];
    workspaceMembership = { user_id: 'user-1' };

    mocks.fromMock.mockImplementation((table: string) => {
      switch (table) {
        case 'notification_batches':
          return {
            select: vi.fn(() =>
              createResolvedChain({ data: [batch], error: null })
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

  it('sends valid notifications even when stale logs are skipped in the same batch', async () => {
    deliveryLogs = [
      deliveryLogs[0]!,
      {
        id: 'log-2',
        notification_id: 'notification-2',
        notifications: {
          ...deliveryLogs[0]!.notifications,
          created_at: '2026-03-26T00:00:00.000Z',
          id: 'notification-2',
          title: 'Old security alert',
        },
      },
    ];

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
    expect(mocks.sendPushNotificationBatchMock).toHaveBeenCalledTimes(1);
  });

  it('drains fully stale batches as skipped', async () => {
    deliveryLogs = [
      {
        ...deliveryLogs[0]!,
        notifications: {
          ...deliveryLogs[0]!.notifications,
          created_at: '2026-03-26T00:00:00.000Z',
        },
      },
    ];

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
});
