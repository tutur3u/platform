import type { NotificationItem } from '@tuturuuu/transactional/emails/notification-digest';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  hasWebCronBudget,
  WEB_CRON_BATCH_LIMIT,
} from '@/lib/cron/web-cron-budget';
import {
  chunkValues,
  fetchAllChunkedPaginatedRows,
  fetchAllPaginatedRows,
} from './cron-helpers';

export const PROCESSING_DEADLINE_MS = 165_000;
const RESTRICT_TO_ROOT_WORKSPACE_ONLY = true;
export function getPrivateNotificationClient(sbAdmin: any) {
  return sbAdmin.schema('private');
}
type NotificationBatchRow = {
  channel: string;
  email: string | null;
  id: string;
  user_id: string | null;
  window_end: string;
  window_start: string;
  ws_id: string | null;
};

export type BatchNotificationRow = {
  created_at: string;
  data: Record<string, unknown> | null;
  description: string | null;
  entity_id: string | null;
  entity_type: string | null;
  id: string;
  scope?: string | null;
  title: string;
  type: string;
  user_id?: string | null;
  ws_id?: string | null;
};

export type DeliveryLogRow = {
  batch_id?: string | null;
  id: string;
  notification_id: string;
  notifications: BatchNotificationRow | null;
};

type RawDeliveryLogRow = Omit<DeliveryLogRow, 'notifications'>;

type UserLookupRow = {
  display_name: string | null;
  email: Array<{ email: string }> | null;
  id: string;
};

type UserData = {
  display_name: string | null;
  email: string | null;
  id: string;
};

type PendingDeliveryLogRetryRow = {
  id: string;
  retry_count: number | null;
};

function sortDeliveryLogsByCreatedAtDesc<T extends DeliveryLogRow>(
  logs: T[]
): T[] {
  return [...logs].sort((left, right) => {
    const leftTime = left.notifications?.created_at
      ? new Date(left.notifications.created_at).getTime()
      : 0;
    const rightTime = right.notifications?.created_at
      ? new Date(right.notifications.created_at).getTime()
      : 0;

    return rightTime - leftTime;
  });
}

async function fetchNotificationsByIds(
  sbAdmin: any,
  notificationIds: string[]
): Promise<Map<string, BatchNotificationRow>> {
  const notificationsById = new Map<string, BatchNotificationRow>();

  if (notificationIds.length === 0) {
    return notificationsById;
  }

  const notifications = await fetchAllChunkedPaginatedRows<
    BatchNotificationRow,
    string
  >(
    [...new Set(notificationIds)],
    (notificationIdChunk, from, to) =>
      sbAdmin
        .from('notifications')
        .select(
          `
          id,
          type,
          title,
          description,
          data,
          created_at,
          ws_id,
          user_id,
          scope,
          entity_type,
          entity_id
        `
        )
        .in('id', notificationIdChunk)
        .order('id', { ascending: true })
        .range(from, to),
    {
      chunkSize: 500,
    }
  );

  for (const notification of notifications) {
    notificationsById.set(notification.id, notification);
  }

  return notificationsById;
}

export async function fetchPendingBatchedNotificationBatches(
  sbAdmin: any
): Promise<NotificationBatchRow[]> {
  return fetchAllPaginatedRows<NotificationBatchRow>((from, to) => {
    let query = getPrivateNotificationClient(sbAdmin)
      .from('notification_batches')
      .select('*')
      .eq('status', 'pending')
      .eq('delivery_mode', 'batched')
      .lte('window_end', new Date().toISOString());

    if (RESTRICT_TO_ROOT_WORKSPACE_ONLY) {
      query = query.or(`ws_id.eq.${ROOT_WORKSPACE_ID},ws_id.is.null`);
    }

    if (hasWebCronBudget()) {
      return query
        .order('window_end', { ascending: true })
        .order('id', { ascending: true })
        .range(0, WEB_CRON_BATCH_LIMIT - 1);
    }
    return query
      .order('window_end', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);
  });
}

export async function filterRootScopedBatches(
  sbAdmin: any,
  batches: NotificationBatchRow[]
): Promise<NotificationBatchRow[]> {
  if (!RESTRICT_TO_ROOT_WORKSPACE_ONLY || batches.length === 0) {
    return batches;
  }

  const batchesWithWsId = batches.filter((batch) => batch.ws_id !== null);
  const batchesWithNullWsId = batches.filter((batch) => batch.ws_id === null);

  if (batchesWithNullWsId.length === 0) {
    return batchesWithWsId;
  }

  const nullWsIdBatchIds = batchesWithNullWsId.map((batch) => batch.id);
  const deliveryLogsForCheck = await fetchAllChunkedPaginatedRows<
    Pick<RawDeliveryLogRow, 'batch_id' | 'notification_id'>,
    string
  >(
    nullWsIdBatchIds,
    (batchIdChunk, from, to) =>
      getPrivateNotificationClient(sbAdmin)
        .from('notification_delivery_log')
        .select('batch_id, notification_id')
        .in('batch_id', batchIdChunk)
        .order('batch_id', { ascending: true })
        .range(from, to),
    {
      chunkSize: 500,
    }
  );
  const notificationsById = await fetchNotificationsByIds(
    sbAdmin,
    deliveryLogsForCheck.map((log) => log.notification_id)
  );

  const validBatchIds = new Set<string>(
    batchesWithWsId.map((batch) => batch.id)
  );
  for (const log of deliveryLogsForCheck) {
    const notification = notificationsById.get(log.notification_id);
    if (!log.batch_id || !notification) {
      continue;
    }

    const workspaceId =
      notification.entity_id ||
      (notification.data?.workspace_id as string | undefined);

    if (workspaceId === ROOT_WORKSPACE_ID) {
      validBatchIds.add(log.batch_id);
    }
  }

  return batches.filter((batch) => validBatchIds.has(batch.id));
}

export async function fetchPendingBatchDeliveryLogs(
  sbAdmin: any,
  batchId: string,
  channel: string
): Promise<DeliveryLogRow[]> {
  const deliveryLogs = await fetchAllPaginatedRows<RawDeliveryLogRow>(
    (from, to) =>
      getPrivateNotificationClient(sbAdmin)
        .from('notification_delivery_log')
        .select('batch_id, notification_id, id')
        .eq('batch_id', batchId)
        .eq('status', 'pending')
        .eq('channel', channel)
        .order('id', { ascending: true })
        .range(from, to)
  );
  const notificationsById = await fetchNotificationsByIds(
    sbAdmin,
    deliveryLogs.map((log) => log.notification_id)
  );

  return sortDeliveryLogsByCreatedAtDesc(
    deliveryLogs.map((log) => ({
      ...log,
      notifications: notificationsById.get(log.notification_id) ?? null,
    }))
  );
}

async function fetchPendingDeliveryLogRetries(
  sbAdmin: any,
  batchId: string
): Promise<PendingDeliveryLogRetryRow[]> {
  return fetchAllPaginatedRows<PendingDeliveryLogRetryRow>((from, to) =>
    getPrivateNotificationClient(sbAdmin)
      .from('notification_delivery_log')
      .select('id, retry_count')
      .eq('batch_id', batchId)
      .eq('status', 'pending')
      .order('id', { ascending: true })
      .range(from, to)
  );
}

export async function fetchPushDevicesForUser(
  sbAdmin: any,
  userId: string
): Promise<Array<{ token: string }>> {
  return fetchAllPaginatedRows<Array<{ token: string }>[number]>((from, to) =>
    sbAdmin
      .from('notification_push_devices')
      .select('token')
      .eq('user_id', userId)
      .order('token', { ascending: true })
      .range(from, to)
  );
}

export async function fetchUsersByIds(
  sbAdmin: any,
  userIds: string[]
): Promise<Map<string, UserData>> {
  const usersMap = new Map<string, UserData>();

  if (userIds.length === 0) {
    return usersMap;
  }

  const rows = await fetchAllChunkedPaginatedRows<UserLookupRow, string>(
    userIds,
    (userIdChunk, from, to) =>
      sbAdmin
        .from('users')
        .select('id, display_name, email:user_private_details(email)')
        .in('id', userIdChunk)
        .order('id', { ascending: true })
        .range(from, to),
    {
      chunkSize: 500,
    }
  );

  for (const user of rows) {
    usersMap.set(user.id, {
      id: user.id,
      display_name: user.display_name,
      email: user.email?.[0]?.email || null,
    });
  }

  return usersMap;
}

export async function markDeliveryLogsSentByIds(
  sbAdmin: any,
  logIds: string[],
  batchId?: string
) {
  const patch = {
    status: 'sent',
    sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (logIds.length > 0) {
    for (const idChunk of chunkValues([...new Set(logIds)])) {
      const { error } = await getPrivateNotificationClient(sbAdmin)
        .from('notification_delivery_log')
        .update(patch)
        .in('id', idChunk)
        .eq('status', 'pending');
      if (error) throw error;
    }
    return;
  }

  if (!batchId) {
    return;
  }

  const { error } = await getPrivateNotificationClient(sbAdmin)
    .from('notification_delivery_log')
    .update(patch)
    .eq('batch_id', batchId)
    .eq('status', 'pending');
  if (error) throw error;
}

export async function markDeliveryLogsSkipped(
  sbAdmin: any,
  logIds: string[],
  reason: string
) {
  if (logIds.length === 0) {
    return;
  }

  const patch = {
    error_message: reason,
    sent_at: new Date().toISOString(),
    status: 'sent',
    updated_at: new Date().toISOString(),
  };

  for (const idChunk of chunkValues([...new Set(logIds)])) {
    const { error } = await getPrivateNotificationClient(sbAdmin)
      .from('notification_delivery_log')
      .update(patch)
      .in('id', idChunk)
      .eq('status', 'pending');
    if (error) throw error;
  }
}

export async function markBatchSent(
  sbAdmin: any,
  batchId: string,
  notificationCount: number
) {
  const { error } = await getPrivateNotificationClient(sbAdmin)
    .from('notification_batches')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      notification_count: notificationCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId);
  if (error) throw error;
}

export async function markBatchFailed(
  sbAdmin: any,
  batchId: string,
  message: string
) {
  await getPrivateNotificationClient(sbAdmin)
    .from('notification_batches')
    .update({
      status: 'failed',
      error_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId);

  const failedLogs = await fetchPendingDeliveryLogRetries(sbAdmin, batchId);

  for (const log of failedLogs) {
    await getPrivateNotificationClient(sbAdmin)
      .from('notification_delivery_log')
      .update({
        status: 'failed',
        error_message: message,
        retry_count: (log.retry_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', log.id);
  }
}

export async function cleanupInvalidPushTokens(sbAdmin: any, tokens: string[]) {
  if (tokens.length === 0) {
    return;
  }

  for (const tokenChunk of chunkValues([...new Set(tokens)])) {
    const { error } = await sbAdmin
      .from('notification_push_devices')
      .delete()
      .in('token', tokenChunk);

    if (error) {
      console.error('Failed to delete invalid push tokens:', error);
    }
  }
}

export function buildNotificationItems(
  deliverableLogs: DeliveryLogRow[]
): NotificationItem[] {
  return deliverableLogs
    .map((log) => log.notifications)
    .filter((notification): notification is BatchNotificationRow =>
      Boolean(notification)
    )
    .map((notification) => {
      const data = notification.data ?? {};
      const actionUrl =
        (data.action_url as string | undefined) ||
        (data.url as string | undefined) ||
        (data.link as string | undefined);

      return {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        description: notification.description || '',
        data,
        createdAt: notification.created_at,
        actionUrl,
      };
    });
}
