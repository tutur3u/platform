import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';

export type DeliverySkipReason =
  | 'consolidated_to_latest'
  | 'deadline_elapsed'
  | 'task_inactive';

export interface QueuedNotification {
  deliveryLogId: string;
  batchId: string;
  notificationId: string;
  type: string;
  title: string;
  description: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
  entityType: string | null;
  entityId: string | null;
  actionUrl?: string | null;
  isConsolidated?: boolean;
  consolidatedCount?: number;
  changeTypes?: string[];
}

export interface TaskStateSnapshot {
  id: string;
  completedAt: string | null;
  closedAt: string | null;
  deletedAt: string | null;
  endDate: string | null;
}

export interface NotificationBatchRecipient {
  wsId: string | null;
  userId: string | null;
  email: string | null;
  channel: string;
}

export interface QueuedNotificationPlan {
  notificationsToSend: QueuedNotification[];
  skipped: Array<{
    batchId: string;
    deliveryLogId: string;
    notificationId: string;
    reason: DeliverySkipReason;
    consolidatedIntoNotificationId?: string;
  }>;
}

const DEADLINE_REMINDER_TYPE = 'deadline_reminder';

const CONSOLIDATABLE_TASK_NOTIFICATION_TYPES = new Set([
  DEADLINE_REMINDER_TYPE,
  'task_assigned',
  'task_completed',
  'task_deleted',
  'task_moved',
  'task_priority_changed',
  'task_project_linked',
  'task_project_unlinked',
  'task_reopened',
  'task_start_date_changed',
  'task_title_changed',
  'task_description_changed',
  'task_due_date_changed',
  'task_estimation_changed',
  'task_updated',
  'task_label_added',
  'task_label_removed',
  'task_assignee_removed',
]);

const STALE_WHEN_TASK_INACTIVE_TYPES = new Set([
  DEADLINE_REMINDER_TYPE,
  'task_assigned',
  'task_moved',
  'task_priority_changed',
  'task_project_linked',
  'task_project_unlinked',
  'task_start_date_changed',
  'task_title_changed',
  'task_description_changed',
  'task_due_date_changed',
  'task_estimation_changed',
  'task_updated',
  'task_label_added',
  'task_label_removed',
  'task_assignee_removed',
]);

const TERMINAL_TASK_NOTIFICATION_TYPES = new Set([
  'task_completed',
  'task_deleted',
]);

const getIsoTimestamp = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

export const getNotificationBatchRecipientKey = (
  recipient: NotificationBatchRecipient
): string => {
  const email = recipient.email?.trim().toLowerCase() || 'no-email';
  return [
    recipient.channel,
    recipient.wsId || 'no-workspace',
    recipient.userId || email,
  ].join(':');
};

export const getQueuedNotificationActionUrl = (
  notification: Pick<QueuedNotification, 'actionUrl' | 'data'>
): string | undefined =>
  notification.actionUrl ||
  ((notification.data?.action_url as string | undefined) ??
    (notification.data?.task_url as string | undefined) ??
    (notification.data?.url as string | undefined) ??
    (notification.data?.link as string | undefined));

export const getQueuedNotificationTaskId = (
  notification: Pick<QueuedNotification, 'data' | 'entityId' | 'entityType'>
): string | null => {
  const taskIdFromData = notification.data?.task_id;
  if (typeof taskIdFromData === 'string' && taskIdFromData.length > 0) {
    return taskIdFromData;
  }

  if (notification.entityType === 'task' && notification.entityId) {
    return notification.entityId;
  }

  return null;
};

const hasTaskState = (
  task: TaskStateSnapshot | null | undefined
): task is TaskStateSnapshot => Boolean(task);

const isTaskInactive = (task: TaskStateSnapshot): boolean =>
  Boolean(task.completedAt || task.closedAt || task.deletedAt);

const isDeadlineElapsed = (task: TaskStateSnapshot, now: Date): boolean => {
  const endTimestamp = getIsoTimestamp(task.endDate);
  if (endTimestamp == null) {
    return false;
  }

  return endTimestamp <= now.getTime();
};

const sortByNewest = (a: QueuedNotification, b: QueuedNotification) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

export const planQueuedNotifications = (
  notifications: QueuedNotification[],
  taskStates: Map<string, TaskStateSnapshot>,
  now: Date = new Date()
): QueuedNotificationPlan => {
  const taskGroups = new Map<string, QueuedNotification[]>();
  const notificationsToSend: QueuedNotification[] = [];
  const skipped: QueuedNotificationPlan['skipped'] = [];

  for (const notification of notifications) {
    const taskId = getQueuedNotificationTaskId(notification);
    if (
      taskId &&
      CONSOLIDATABLE_TASK_NOTIFICATION_TYPES.has(notification.type)
    ) {
      const existingGroup = taskGroups.get(taskId) || [];
      existingGroup.push(notification);
      taskGroups.set(taskId, existingGroup);
      continue;
    }

    const task = taskId ? taskStates.get(taskId) : undefined;
    if (
      taskId &&
      hasTaskState(task) &&
      notification.type === DEADLINE_REMINDER_TYPE &&
      (isTaskInactive(task) || isDeadlineElapsed(task, now))
    ) {
      skipped.push({
        batchId: notification.batchId,
        deliveryLogId: notification.deliveryLogId,
        notificationId: notification.notificationId,
        reason: isTaskInactive(task) ? 'task_inactive' : 'deadline_elapsed',
      });
      continue;
    }

    if (
      taskId &&
      hasTaskState(task) &&
      STALE_WHEN_TASK_INACTIVE_TYPES.has(notification.type) &&
      isTaskInactive(task)
    ) {
      skipped.push({
        batchId: notification.batchId,
        deliveryLogId: notification.deliveryLogId,
        notificationId: notification.notificationId,
        reason: 'task_inactive',
      });
      continue;
    }

    notificationsToSend.push(notification);
  }

  for (const [taskId, group] of taskGroups.entries()) {
    const sortedGroup = [...group].sort(sortByNewest);
    const task = taskStates.get(taskId);
    const taskHasState = hasTaskState(task);
    const taskInactive = taskHasState && isTaskInactive(task);
    const deadlineElapsed = taskHasState && isDeadlineElapsed(task, now);

    let survivor: QueuedNotification | null = null;

    if (taskHasState && taskInactive) {
      survivor =
        sortedGroup.find((notification) =>
          TERMINAL_TASK_NOTIFICATION_TYPES.has(notification.type)
        ) || null;
    } else {
      survivor =
        sortedGroup.find(
          (notification) =>
            !(notification.type === DEADLINE_REMINDER_TYPE && deadlineElapsed)
        ) || null;
    }

    if (!survivor) {
      for (const notification of sortedGroup) {
        skipped.push({
          batchId: notification.batchId,
          deliveryLogId: notification.deliveryLogId,
          notificationId: notification.notificationId,
          reason:
            taskHasState &&
            notification.type === DEADLINE_REMINDER_TYPE &&
            deadlineElapsed
              ? 'deadline_elapsed'
              : 'task_inactive',
        });
      }
      continue;
    }

    const changeTypes = [...new Set(sortedGroup.map((item) => item.type))];
    let consolidatedCount = 1;

    for (const notification of sortedGroup) {
      if (notification.deliveryLogId === survivor.deliveryLogId) {
        continue;
      }

      const reason: DeliverySkipReason =
        !taskInactive &&
        notification.type === DEADLINE_REMINDER_TYPE &&
        deadlineElapsed
          ? 'deadline_elapsed'
          : 'consolidated_to_latest';

      if (reason === 'consolidated_to_latest') {
        consolidatedCount += 1;
      }

      skipped.push({
        batchId: notification.batchId,
        deliveryLogId: notification.deliveryLogId,
        notificationId: notification.notificationId,
        reason,
        consolidatedIntoNotificationId:
          reason === 'consolidated_to_latest'
            ? survivor.notificationId
            : undefined,
      });
    }

    notificationsToSend.push({
      ...survivor,
      isConsolidated: consolidatedCount > 1 || survivor.isConsolidated,
      consolidatedCount: Math.max(
        consolidatedCount,
        survivor.consolidatedCount || 1
      ),
      changeTypes:
        survivor.changeTypes && survivor.changeTypes.length > 0
          ? [...new Set([...survivor.changeTypes, ...changeTypes])]
          : changeTypes,
    });
  }

  notificationsToSend.sort(sortByNewest);

  return {
    notificationsToSend,
    skipped,
  };
};

export async function fetchTaskStateMap(
  sbAdmin: TypedSupabaseClient,
  notifications: QueuedNotification[]
) {
  const taskIds = [
    ...new Set(
      notifications
        .map((notification) => getQueuedNotificationTaskId(notification))
        .filter((taskId): taskId is string => Boolean(taskId))
    ),
  ];

  if (taskIds.length === 0) {
    return new Map<string, TaskStateSnapshot>();
  }

  const { data: tasks } = await sbAdmin
    .from('tasks')
    .select('id, completed_at, closed_at, deleted_at, end_date')
    .in('id', taskIds);

  const taskStateMap = new Map<string, TaskStateSnapshot>();
  for (const task of (tasks || []) as Array<{
    id: string;
    completed_at: string | null;
    closed_at: string | null;
    deleted_at: string | null;
    end_date: string | null;
  }>) {
    taskStateMap.set(task.id, {
      id: task.id,
      completedAt: task.completed_at,
      closedAt: task.closed_at,
      deletedAt: task.deleted_at,
      endDate: task.end_date,
    });
  }

  return taskStateMap;
}

export async function markDeliveryLogsSkipped(
  sbAdmin: TypedSupabaseClient,
  skippedEntries: Array<{
    deliveryLogId: string;
    reason: string;
    consolidatedIntoNotificationId?: string;
  }>
) {
  if (skippedEntries.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const groupedEntries = new Map<string, string[]>();

  for (const entry of skippedEntries) {
    const key = `${entry.reason}:${entry.consolidatedIntoNotificationId || 'none'}`;
    const existing = groupedEntries.get(key) || [];
    existing.push(entry.deliveryLogId);
    groupedEntries.set(key, existing);
  }

  for (const [key, logIds] of groupedEntries) {
    const [reason, consolidatedIntoNotificationId] = key.split(':');
    await sbAdmin
      .from('notification_delivery_log')
      .update({
        status: 'skipped',
        skip_reason: reason,
        consolidated_into_notification_id:
          consolidatedIntoNotificationId === 'none'
            ? null
            : consolidatedIntoNotificationId,
        updated_at: now,
      } as never)
      .in('id', logIds)
      .eq('status', 'pending');
  }
}

export async function markDeliveryLogsFailedForBatches(
  sbAdmin: TypedSupabaseClient,
  batchIds: string[],
  errorMessage: string
) {
  if (batchIds.length === 0) {
    return;
  }

  await sbAdmin
    .from('notification_delivery_log')
    .update({
      status: 'failed',
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    } as never)
    .in('batch_id', batchIds)
    .eq('status', 'pending');
}

export async function markBatchesSkipped(
  sbAdmin: TypedSupabaseClient,
  batchIds: string[],
  options: {
    consolidatedIntoBatchId?: string;
    reason: string;
  }
) {
  if (batchIds.length === 0) {
    return;
  }

  await sbAdmin
    .from('notification_batches')
    .update({
      status: 'skipped',
      skip_reason: options.reason,
      consolidated_into_batch_id: options.consolidatedIntoBatchId || null,
      updated_at: new Date().toISOString(),
    } as never)
    .in('id', batchIds)
    .eq('status', 'pending');
}
