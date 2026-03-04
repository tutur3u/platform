import { describe, expect, it } from 'vitest';
import {
  getNotificationBatchRecipientKey,
  planQueuedNotifications,
  type QueuedNotification,
  type TaskStateSnapshot,
} from '@/app/api/notifications/delivery-utils';

const createQueuedNotification = (
  overrides: Partial<QueuedNotification> = {}
): QueuedNotification => ({
  deliveryLogId: overrides.deliveryLogId || 'log-1',
  batchId: overrides.batchId || 'batch-1',
  notificationId: overrides.notificationId || 'notification-1',
  type: overrides.type || 'task_updated',
  title: overrides.title || 'Task title',
  description: overrides.description ?? 'Task changed',
  data: overrides.data ?? { task_id: 'task-1' },
  createdAt: overrides.createdAt || '2026-03-04T09:00:00.000Z',
  entityType: overrides.entityType ?? 'task',
  entityId: overrides.entityId ?? 'task-1',
  actionUrl: overrides.actionUrl ?? null,
  isConsolidated: overrides.isConsolidated,
  consolidatedCount: overrides.consolidatedCount,
  changeTypes: overrides.changeTypes,
});

const createTaskState = (
  overrides: Partial<TaskStateSnapshot> = {}
): TaskStateSnapshot => ({
  id: overrides.id || 'task-1',
  completedAt: overrides.completedAt ?? null,
  closedAt: overrides.closedAt ?? null,
  deletedAt: overrides.deletedAt ?? null,
  endDate: overrides.endDate ?? '2026-03-04T18:00:00.000Z',
});

describe('delivery-utils', () => {
  describe('getNotificationBatchRecipientKey', () => {
    it('normalizes email recipients into a stable key', () => {
      expect(
        getNotificationBatchRecipientKey({
          wsId: 'ws-1',
          userId: null,
          email: ' Test@Example.com ',
          channel: 'email',
        })
      ).toBe('email:ws-1:test@example.com');
    });
  });

  describe('planQueuedNotifications', () => {
    it('consolidates older task notifications into the latest terminal update', () => {
      const notifications = [
        createQueuedNotification({
          deliveryLogId: 'log-older',
          notificationId: 'notif-older',
          type: 'task_updated',
          createdAt: '2026-03-04T09:00:00.000Z',
        }),
        createQueuedNotification({
          deliveryLogId: 'log-latest',
          notificationId: 'notif-latest',
          type: 'task_completed',
          createdAt: '2026-03-04T09:05:00.000Z',
          description: 'Task completed',
        }),
      ];

      const taskStates = new Map<string, TaskStateSnapshot>([
        [
          'task-1',
          createTaskState({ completedAt: '2026-03-04T09:05:00.000Z' }),
        ],
      ]);

      const plan = planQueuedNotifications(
        notifications,
        taskStates,
        new Date('2026-03-04T09:10:00.000Z')
      );

      expect(plan.notificationsToSend).toHaveLength(1);
      expect(plan.notificationsToSend[0]?.notificationId).toBe('notif-latest');
      expect(plan.notificationsToSend[0]?.isConsolidated).toBe(true);
      expect(plan.notificationsToSend[0]?.consolidatedCount).toBe(2);

      expect(plan.skipped).toEqual([
        {
          batchId: 'batch-1',
          deliveryLogId: 'log-older',
          notificationId: 'notif-older',
          reason: 'consolidated_to_latest',
          consolidatedIntoNotificationId: 'notif-latest',
        },
      ]);
    });

    it('skips deadline reminders after the deadline has already passed', () => {
      const notifications = [
        createQueuedNotification({
          deliveryLogId: 'log-deadline',
          notificationId: 'notif-deadline',
          type: 'deadline_reminder',
          description: 'Due soon',
          createdAt: '2026-03-04T10:00:00.000Z',
        }),
      ];

      const taskStates = new Map<string, TaskStateSnapshot>([
        ['task-1', createTaskState({ endDate: '2026-03-04T09:30:00.000Z' })],
      ]);

      const plan = planQueuedNotifications(
        notifications,
        taskStates,
        new Date('2026-03-04T10:30:00.000Z')
      );

      expect(plan.notificationsToSend).toHaveLength(0);
      expect(plan.skipped).toEqual([
        {
          batchId: 'batch-1',
          deliveryLogId: 'log-deadline',
          notificationId: 'notif-deadline',
          reason: 'deadline_elapsed',
        },
      ]);
    });

    it('does not treat missing task state as an inactive task', () => {
      const notifications = [
        createQueuedNotification({
          deliveryLogId: 'log-missing-task',
          notificationId: 'notif-missing-task',
          type: 'deadline_reminder',
          description: 'Due soon',
        }),
      ];

      const plan = planQueuedNotifications(
        notifications,
        new Map(),
        new Date('2026-03-04T10:30:00.000Z')
      );

      expect(plan.notificationsToSend).toHaveLength(1);
      expect(plan.notificationsToSend[0]?.notificationId).toBe(
        'notif-missing-task'
      );
      expect(plan.skipped).toHaveLength(0);
    });

    it('does not treat missing task state as inactive for task updates', () => {
      const notifications = [
        createQueuedNotification({
          deliveryLogId: 'log-update',
          notificationId: 'notif-update',
          type: 'task_updated',
          data: { task_id: 'task-missing' },
        }),
      ];

      const plan = planQueuedNotifications(
        notifications,
        new Map(),
        new Date('2026-03-04T10:30:00.000Z')
      );

      expect(plan.notificationsToSend).toHaveLength(1);
      expect(plan.notificationsToSend[0]?.notificationId).toBe('notif-update');
      expect(plan.skipped).toHaveLength(0);
    });

    it('skips all notifications if task is inactive and no terminal updates exist', () => {
      const notifications = [
        createQueuedNotification({
          deliveryLogId: 'log-update',
          notificationId: 'notif-update',
          type: 'task_updated',
          createdAt: '2026-03-04T09:00:00.000Z',
        }),
      ];

      const taskStates = new Map<string, TaskStateSnapshot>([
        [
          'task-1',
          createTaskState({ completedAt: '2026-03-04T08:00:00.000Z' }),
        ],
      ]);

      const plan = planQueuedNotifications(
        notifications,
        taskStates,
        new Date('2026-03-04T09:10:00.000Z')
      );

      expect(plan.notificationsToSend).toHaveLength(0);
      expect(plan.skipped).toEqual([
        {
          batchId: 'batch-1',
          deliveryLogId: 'log-update',
          notificationId: 'notif-update',
          reason: 'task_inactive',
        },
      ]);
    });

    it('keeps unrelated notifications separate', () => {
      const notifications = [
        createQueuedNotification({
          deliveryLogId: 'log-comment',
          notificationId: 'notif-comment',
          type: 'comment_added',
          data: { comment_id: 'comment-1' },
          entityType: null,
          entityId: null,
        }),
      ];

      const plan = planQueuedNotifications(notifications, new Map());

      expect(plan.notificationsToSend).toHaveLength(1);
      expect(plan.notificationsToSend[0]?.notificationId).toBe('notif-comment');
      expect(plan.skipped).toHaveLength(0);
    });
  });
});
