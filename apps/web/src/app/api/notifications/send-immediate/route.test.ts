import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const fromMock = vi.fn();
  const sendPushNotificationBatchMock = vi.fn();

  return {
    fromMock,
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
    order: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  };

  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(result));
  chain.order = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);

  return chain;
}

import { POST } from './route';

describe('send-immediate push processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    mocks.sendPushNotificationBatchMock.mockResolvedValue({
      deliveredCount: 1,
      invalidTokens: [],
    });

    const batch = {
      channel: 'push',
      email: null,
      id: 'batch-1',
      user_id: 'user-1',
      ws_id: ROOT_WORKSPACE_ID,
    };
    const notification = {
      code: null,
      created_at: '2026-03-28T00:00:00.000Z',
      data: { board_id: 'board-1', workspace_id: ROOT_WORKSPACE_ID },
      description: 'You were mentioned',
      entity_id: 'task-1',
      entity_type: 'task',
      id: 'notification-1',
      title: 'Task mention',
      type: 'task_mention',
      ws_id: ROOT_WORKSPACE_ID,
    };

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
                data: [
                  {
                    batch_id: batch.id,
                    notification_id: notification.id,
                    notifications: notification,
                  },
                ],
                error: null,
              })
            ),
            update: vi.fn(() =>
              createResolvedChain({ data: null, error: null })
            ),
          };
        case 'users':
          return {
            select: vi.fn(() =>
              createResolvedChain({
                data: [
                  {
                    display_name: 'User One',
                    email: [{ email: 'user@example.com' }],
                    id: 'user-1',
                  },
                ],
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
        case 'notification_email_config':
          return {
            select: vi.fn(() => createResolvedChain({ data: [], error: null })),
          };
        case 'notification_push_devices':
          return {
            select: vi.fn(() =>
              createResolvedChain({
                data: [{ token: 'token-1', user_id: 'user-1' }],
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
});
