import { render } from '@react-email/render';
import DeadlineReminderEmail from '@tuturuuu/transactional/emails/deadline-reminder';
import WorkspaceInviteEmail from '@tuturuuu/transactional/emails/workspace-invite';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { z } from 'zod';
import {
  chunkValues,
  fetchAllChunkedPaginatedRows,
  fetchAllPaginatedRows,
} from '@/lib/notifications/cron-helpers';
import type { PushDeviceRegistration } from '@/lib/notifications/push-delivery';

import { isPersonalMailPush } from './mail-push';
export const PROCESSING_DEADLINE_MS = 165_000;

import {
  isRootScopedNotification,
  RESTRICT_TO_ROOT_WORKSPACE_ONLY,
} from './rollout';

export function getPrivateNotificationClient(sbAdmin: any) {
  return sbAdmin.schema('private');
}

export const RequestBodySchema = z.object({
  batch_id: z.string().max(MAX_NAME_LENGTH).optional(),
  batch_ids: z.array(z.string()).optional(),
});

export type EmailTemplateType =
  | 'workspace-invite'
  | 'deadline-reminder'
  | 'notification-digest';

export interface NotificationData {
  code?: string;
  created_at: string;
  data: Record<string, any>;
  description: string | null;
  entity_id?: string | null;
  entity_type?: string | null;
  id: string;
  scope?: string | null;
  title: string;
  type: string;
  user_id?: string | null;
  ws_id?: string | null;
}

export interface RenderTemplateParams {
  notification: NotificationData;
  templateType: EmailTemplateType;
  userName: string;
  workspaceName?: string;
}

export interface UserData {
  display_name: string | null;
  email: string | null;
  id: string;
}

export interface WorkspaceData {
  id: string;
  name: string | null;
}

export interface EmailConfigData {
  email_subject_template: string | null;
  email_template: string | null;
  notification_type: string;
}

export interface NotificationBatchRow {
  channel: string;
  email: string | null;
  id: string;
  user_id: string | null;
  window_end: string;
  ws_id: string | null;
}

export interface DeliveryLogWithNotification {
  batch_id: string;
  id: string;
  notification_id: string;
  notifications: NotificationData | null;
}

export type RawDeliveryLogWithNotification = Omit<
  DeliveryLogWithNotification,
  'notifications'
>;

export interface PendingDeliveryLogRetryRow {
  id: string;
  retry_count: number | null;
}

export interface UserLookupRow {
  display_name: string | null;
  email: Array<{ email: string }> | null;
  id: string;
}

export interface WorkspaceLookupRow {
  id: string;
  name: string | null;
}

export interface PushDeviceLookupRow {
  token: string;
  user_id: string;
}

export function sortDeliveryLogsByCreatedAtDesc(
  logs: DeliveryLogWithNotification[]
): DeliveryLogWithNotification[] {
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

export async function fetchNotificationsByIds(
  sbAdmin: any,
  notificationIds: string[]
): Promise<Map<string, NotificationData>> {
  const notificationsById = new Map<string, NotificationData>();

  if (notificationIds.length === 0) {
    return notificationsById;
  }

  const notifications = await fetchAllChunkedPaginatedRows<
    NotificationData,
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
          code,
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

export async function markDeliveryLogsSent(sbAdmin: any, logIds: string[]) {
  if (logIds.length === 0) {
    return;
  }

  const patch = {
    status: 'sent',
    sent_at: new Date().toISOString(),
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

export async function markDeliveryLogsSkipped(
  sbAdmin: any,
  logs: DeliveryLogWithNotification[],
  reason: string
) {
  const logIds = logs.map((log) => log.id).filter(Boolean);
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
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId);
  if (error) throw error;
}

export async function fetchPendingDeliveryLogRetries(
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

export async function markBatchFailed(
  sbAdmin: any,
  batchId: string,
  message: string
) {
  const { error } = await getPrivateNotificationClient(sbAdmin)
    .from('notification_batches')
    .update({
      status: 'failed',
      error_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId);
  if (error) throw error;

  const pendingLogs = await fetchPendingDeliveryLogRetries(sbAdmin, batchId);

  for (const log of pendingLogs) {
    const { error } = await getPrivateNotificationClient(sbAdmin)
      .from('notification_delivery_log')
      .update({
        status: 'failed',
        error_message: message,
        retry_count: (log.retry_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', log.id);
    if (error) throw error;
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

export async function renderEmailTemplate(
  params: RenderTemplateParams
): Promise<{
  html: string;
  subject: string;
}> {
  const { templateType, notification, userName, workspaceName } = params;

  switch (templateType) {
    case 'workspace-invite': {
      const inviterName =
        notification.data?.inviter_name ||
        notification.data?.inviterName ||
        'Someone';
      const wsName =
        notification.data?.workspace_name ||
        notification.data?.workspaceName ||
        workspaceName ||
        'a workspace';
      const workspaceId =
        notification.data?.workspace_id || notification.data?.workspaceId;

      const html = await render(
        WorkspaceInviteEmail({
          inviteeName: userName,
          inviterName,
          workspaceName: wsName,
          workspaceId,
        })
      );

      return {
        html,
        subject: `You've been invited to join ${wsName}`,
      };
    }

    case 'deadline-reminder': {
      const taskName =
        (notification.data?.task_name as string) || 'Untitled Task';
      const boardName = (notification.data?.board_name as string) || 'Board';
      const dueDate = notification.data?.end_date as string | undefined;
      const reminderInterval =
        (notification.data?.reminder_interval as string) || '24 hours';
      const taskUrl = notification.data?.task_url as string | undefined;

      const html = await render(
        DeadlineReminderEmail({
          userName,
          taskName,
          boardName,
          workspaceName,
          dueDate,
          reminderInterval,
          taskUrl,
        })
      );

      return {
        html,
        subject: `Task Due Soon: ${taskName}`,
      };
    }

    default:
      throw new Error(`Unknown template type: ${templateType}`);
  }
}

export async function fetchPendingImmediateBatches(
  sbAdmin: any,
  batchIds: string[]
): Promise<NotificationBatchRow[]> {
  return fetchAllPaginatedRows<NotificationBatchRow>((from, to) => {
    let query = getPrivateNotificationClient(sbAdmin)
      .from('notification_batches')
      .select('*')
      .eq('status', 'pending')
      .eq('delivery_mode', 'immediate');

    if (batchIds.length > 0) {
      query = query.in('id', batchIds);
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
  const validBatchesWithWsId = batchesWithWsId.filter((batch) =>
    isRootScopedNotification(batch)
  );
  const batchesWithNullWsId = batches.filter((batch) => batch.ws_id === null);

  if (batchesWithNullWsId.length === 0) {
    return validBatchesWithWsId;
  }

  const deliveryLogsForCheck = await fetchAllChunkedPaginatedRows<
    Pick<RawDeliveryLogWithNotification, 'batch_id' | 'notification_id'>,
    string
  >(
    batchesWithNullWsId.map((batch) => batch.id),
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

  const validBatchIds = new Set(validBatchesWithWsId.map((batch) => batch.id));
  for (const log of deliveryLogsForCheck) {
    const notification = notificationsById.get(log.notification_id);
    if (!log.batch_id || !notification) {
      continue;
    }

    if (
      isRootScopedNotification(notification) ||
      isPersonalMailPush(
        notification,
        batches.find((batch) => batch.id === log.batch_id)
      )
    ) {
      validBatchIds.add(log.batch_id);
    }
  }

  return batches.filter((batch) => validBatchIds.has(batch.id));
}

export async function fetchDeliveryLogsForBatches(
  sbAdmin: any,
  batchIds: string[]
): Promise<Map<string, DeliveryLogWithNotification[]>> {
  const deliveryLogs = await fetchAllChunkedPaginatedRows<
    RawDeliveryLogWithNotification,
    string
  >(
    batchIds,
    (batchIdChunk, from, to) =>
      getPrivateNotificationClient(sbAdmin)
        .from('notification_delivery_log')
        .select('id, batch_id, notification_id')
        .in('batch_id', batchIdChunk)
        .eq('status', 'pending')
        .order('batch_id', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    {
      chunkSize: 500,
    }
  );
  const notificationsById = await fetchNotificationsByIds(
    sbAdmin,
    deliveryLogs.map((log) => log.notification_id)
  );

  const deliveryLogsByBatch = new Map<string, DeliveryLogWithNotification[]>();
  for (const log of deliveryLogs) {
    const existingLogs = deliveryLogsByBatch.get(log.batch_id) || [];
    existingLogs.push({
      ...log,
      notifications: notificationsById.get(log.notification_id) ?? null,
    });
    deliveryLogsByBatch.set(log.batch_id, existingLogs);
  }

  for (const [batchId, batchLogs] of deliveryLogsByBatch.entries()) {
    deliveryLogsByBatch.set(
      batchId,
      sortDeliveryLogsByCreatedAtDesc(batchLogs)
    );
  }

  return deliveryLogsByBatch;
}

export async function fetchUsersByIds(
  sbAdmin: any,
  userIds: string[]
): Promise<Map<string, UserData>> {
  const usersMap = new Map<string, UserData>();
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

export async function fetchWorkspacesByIds(
  sbAdmin: any,
  workspaceIds: string[]
): Promise<Map<string, WorkspaceData>> {
  const workspacesMap = new Map<string, WorkspaceData>();
  const rows = await fetchAllChunkedPaginatedRows<WorkspaceLookupRow, string>(
    workspaceIds,
    (workspaceIdChunk, from, to) =>
      sbAdmin
        .from('workspaces')
        .select('id, name')
        .in('id', workspaceIdChunk)
        .order('id', { ascending: true })
        .range(from, to),
    {
      chunkSize: 500,
    }
  );

  for (const workspace of rows) {
    workspacesMap.set(workspace.id, workspace);
  }

  return workspacesMap;
}

export async function fetchImmediateEmailConfigs(
  sbAdmin: any,
  notificationTypes: string[]
): Promise<Map<string, EmailConfigData>> {
  const emailConfigsMap = new Map<string, EmailConfigData>();

  if (notificationTypes.length === 0) {
    return emailConfigsMap;
  }

  const rows: EmailConfigData[] = [];

  for (const notificationTypeChunk of chunkValues(
    [...new Set(notificationTypes)],
    500
  )) {
    const { data, error } = await sbAdmin.rpc(
      'list_immediate_notification_email_configs',
      {
        p_notification_types: notificationTypeChunk,
      }
    );

    if (error) {
      throw error;
    }

    rows.push(...((data ?? []) as EmailConfigData[]));
  }

  for (const config of rows) {
    emailConfigsMap.set(config.notification_type, config);
  }

  return emailConfigsMap;
}

export async function fetchPushDevicesByUserIds(
  sbAdmin: any,
  userIds: string[]
): Promise<Map<string, PushDeviceRegistration[]>> {
  const pushDevicesByUser = new Map<string, PushDeviceRegistration[]>();

  if (userIds.length === 0) {
    return pushDevicesByUser;
  }

  const rows = await fetchAllChunkedPaginatedRows<PushDeviceLookupRow, string>(
    userIds,
    (userIdChunk, from, to) =>
      sbAdmin
        .from('notification_push_devices')
        .select('user_id, token')
        .in('user_id', userIdChunk)
        .order('user_id', { ascending: true })
        .order('token', { ascending: true })
        .range(from, to),
    {
      chunkSize: 500,
    }
  );

  for (const device of rows) {
    const existingDevices = pushDevicesByUser.get(device.user_id) || [];
    existingDevices.push({ token: device.token });
    pushDevicesByUser.set(device.user_id, existingDevices);
  }

  return pushDevicesByUser;
}
