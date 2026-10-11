import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logs: [] as Array<{ id: string; notifications: Record<string, unknown> }>,
  channel: 'email',
  dueByTask: new Map<string, string | null>(),
  lookupError: false,
  markSkipped: vi.fn(async () => {}),
  markSent: vi.fn(async () => {}),
  markBatchSent: vi.fn(async () => {}),
  markBatchFailed: vi.fn(async () => {}),
  send: vi.fn(async (_args: unknown) => ({ success: true })),
  digest: vi.fn((_args: unknown) => '<digest />'),
  template: vi.fn(async (args: { notification: { id: string } }) => ({
    html: args.notification.id,
    subject: 'task',
  })),
  begin: vi.fn(async () => {}),
  beforeWorkspace: vi.fn(),
}));
const batch = () => ({
  id: 'batch-1',
  channel: mocks.channel,
  user_id: null,
  email: 'recipient@example.com',
  ws_id: 'ws-1',
  window_start: '2026-10-11T00:00:00Z',
  window_end: '2026-10-11T01:00:00Z',
});
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: (table: string) => ({
      select: () => {
        let taskId = '';
        const query = {
          eq: vi.fn(),
          maybeSingle: async () => ({
            data: {
              id: taskId,
              end_date: mocks.dueByTask.get(taskId) ?? null,
              task_lists: { workspace_boards: { ws_id: 'ws-1' } },
            },
            error: mocks.lookupError ? new Error('lookup') : null,
          }),
          single: async () => {
            mocks.beforeWorkspace();
            return { data: { name: 'Workspace' }, error: null };
          },
        };
        query.eq.mockImplementation((key: string, value: string) => {
          if (key === 'id') taskId = value;
          return query;
        });
        if (table !== 'tasks' && table !== 'workspaces')
          throw new Error('Unexpected table');
        return query;
      },
    }),
  }),
}));
vi.mock('@/lib/notifications/cron-helpers', async (original) => {
  const actual = await original<typeof import('./cron-helpers')>();
  const { getTaskEmailSkipReason } = await import('./task-email-freshness');
  return {
    ...actual,
    getNotificationSkipReason: async (
      sb: Parameters<typeof getTaskEmailSkipReason>[0],
      options: {
        channel?: string;
        notification: Parameters<typeof getTaskEmailSkipReason>[1];
      }
    ) =>
      options.channel === 'email'
        ? getTaskEmailSkipReason(sb, options.notification)
        : null,
  };
});
vi.mock('@/lib/email-blacklist', () => ({
  preloadBlockedEmailCache: async () => {},
}));
vi.mock('@/lib/notifications/mail-push', () => ({
  getMailPushSkipReason: async () => null,
}));
vi.mock('@/lib/notifications/delivery-attempt', () => ({
  beginDeliveryAttempt: mocks.begin,
}));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  withCronLogDrain: (_: unknown, callback: () => unknown) => callback(),
}));
vi.mock('@react-email/render', () => ({ render: async () => '<html />' }));
vi.mock('@tuturuuu/email-service', () => ({ sendSystemEmail: mocks.send }));
vi.mock('@tuturuuu/transactional/emails/notification-digest', () => ({
  default: mocks.digest,
  generateSubjectLine: (items: unknown[]) => `${items.length} items`,
}));
vi.mock('@/lib/notifications/push-delivery', () => ({
  sendPushNotificationBatch: vi.fn(),
}));
vi.mock('@/lib/notifications/immediate-helpers', () => ({
  PROCESSING_DEADLINE_MS: 165000,
  RequestBodySchema: { safeParse: () => ({ success: true, data: {} }) },
  fetchPendingImmediateBatches: async () => [batch()],
  filterRootScopedBatches: async (_: unknown, batches: unknown[]) => batches,
  fetchDeliveryLogsForBatches: async () => new Map([['batch-1', mocks.logs]]),
  fetchUsersByIds: async () => new Map(),
  fetchWorkspacesByIds: async () => {
    mocks.beforeWorkspace();
    return new Map([['ws-1', { name: 'Workspace' }]]);
  },
  fetchImmediateEmailConfigs: async () =>
    new Map([['task_assigned', { email_template: 'task-assigned' }]]),
  fetchPushDevicesByUserIds: async () => new Map(),
  getPrivateNotificationClient: () => ({
    from: () => ({
      update: () => {
        const query = {
          eq: vi.fn(),
          select: async () => ({ data: [{ id: 'batch-1' }], error: null }),
        };
        query.eq.mockReturnValue(query);
        return query;
      },
    }),
  }),
  markDeliveryLogsSkipped: mocks.markSkipped,
  markDeliveryLogsSent: mocks.markSent,
  markBatchSent: mocks.markBatchSent,
  markBatchFailed: mocks.markBatchFailed,
  cleanupInvalidPushTokens: vi.fn(),
  renderEmailTemplate: mocks.template,
}));
vi.mock('@/lib/notifications/batched-helpers', async (original) => {
  const actual = await original<typeof import('./batched-helpers')>();
  return {
    ...actual,
    fetchPendingBatchedNotificationBatches: async () => [batch()],
    filterRootScopedBatches: async (_: unknown, batches: unknown[]) => batches,
    fetchPendingBatchDeliveryLogs: async () => mocks.logs,
    fetchUsersByIds: async () => new Map(),
    getPrivateNotificationClient: () => ({
      from: () => ({
        update: () => {
          const query = { eq: vi.fn() };
          query.eq.mockReturnValue(query);
          return query;
        },
      }),
    }),
    markDeliveryLogsSkipped: mocks.markSkipped,
    markDeliveryLogsSentByIds: mocks.markSent,
    markBatchSent: mocks.markBatchSent,
    markBatchFailed: mocks.markBatchFailed,
  };
});

import { GET } from '@/app/api/cron/process-notification-batches/route';
import { POST } from '@/app/api/notifications/send-immediate/route';

const NOW = Date.parse('2026-10-11T12:00:00Z');
function notification(id: string) {
  return {
    id,
    created_at: new Date(NOW - 1000).toISOString(),
    entity_type: 'task',
    entity_id: id,
    ws_id: 'ws-1',
    type: 'task_assigned',
    title: id,
    description: '',
    data: { task_id: id, end_date: '2000-01-01' },
  };
}
async function callRoute(kind: string) {
  const request = new NextRequest('http://localhost/api/notifications', {
    method: kind === 'immediate' ? 'POST' : 'GET',
    headers: { authorization: 'Bearer cron-secret' },
  });
  return kind === 'immediate' ? POST(request) : GET(request);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.stubEnv('CRON_SECRET', 'cron-secret');
  mocks.channel = 'email';
  mocks.lookupError = false;
  mocks.dueByTask.clear();
  mocks.beforeWorkspace.mockImplementation(() => {});
  mocks.logs = ['fresh', 'old'].map((id) => ({
    id: `log-${id}`,
    notifications: notification(id),
  }));
  mocks.dueByTask.set('fresh', new Date(NOW + 1000).toISOString());
  mocks.dueByTask.set('old', new Date(NOW - 86400001).toISOString());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe.each(['immediate', 'digest'])('%s email freshness route', (kind) => {
  it('sends only surviving task items with correct settled counts', async () => {
    const response = await callRoute(kind);
    expect(response.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.markSent).toHaveBeenCalledWith(expect.anything(), [
      'log-fresh',
    ]);
    expect(mocks.markBatchSent).toHaveBeenCalledWith(
      expect.anything(),
      'batch-1',
      2
    );
    if (kind === 'digest') {
      expect(mocks.digest.mock.calls.at(-1)?.[0]).toMatchObject({
        notifications: [expect.objectContaining({ id: 'fresh' })],
      });
      expect(mocks.send.mock.calls.at(-1)?.[0]).toMatchObject({
        content: { subject: '1 items' },
      });
    } else
      expect(mocks.template).toHaveBeenCalledWith(
        expect.objectContaining({
          notification: expect.objectContaining({ id: 'fresh' }),
        })
      );
  });
  it('skips all overdue items before rendering or delivery attempt', async () => {
    mocks.dueByTask.set('fresh', new Date(NOW - 86400001).toISOString());
    await callRoute(kind);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.digest).not.toHaveBeenCalled();
    expect(mocks.template).not.toHaveBeenCalled();
  });
  it('unknown current lookup fails before provider instead of marking overdue', async () => {
    mocks.lookupError = true;
    await callRoute(kind);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.markSkipped).not.toHaveBeenCalled();
    expect(mocks.markBatchFailed).toHaveBeenCalled();
  });
  if (kind === 'digest')
    it('rechecks every item after intervening workspace lookup', async () => {
      mocks.dueByTask.set('old', new Date(NOW + 1000).toISOString());
      mocks.beforeWorkspace.mockImplementation(() => {
        mocks.dueByTask.set('old', new Date(NOW - 86400001).toISOString());
      });
      await callRoute(kind);
      expect(mocks.markSent).toHaveBeenCalledWith(expect.anything(), [
        'log-fresh',
      ]);
      expect(mocks.send).toHaveBeenCalledTimes(1);
    });
  it('does not trust payload dates when current task is rescheduled into the future', async () => {
    mocks.dueByTask.set('old', new Date(NOW + 1000).toISOString());
    await callRoute(kind);
    expect(mocks.markSent).toHaveBeenCalledWith(expect.anything(), [
      'log-fresh',
      'log-old',
    ]);
    expect(mocks.markSkipped).not.toHaveBeenCalled();
  });
});
