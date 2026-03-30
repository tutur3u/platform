import { render } from '@react-email/render';
import { sendSystemEmail } from '@tuturuuu/email-service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import DeadlineReminderEmail from '@tuturuuu/transactional/emails/deadline-reminder';
import NotificationDigestEmail from '@tuturuuu/transactional/emails/notification-digest';
import WorkspaceInviteEmail from '@tuturuuu/transactional/emails/workspace-invite';
import { MAX_NAME_LENGTH, ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { preloadBlockedEmailCache } from '@/lib/email-blacklist';
import {
  chunkValues,
  fetchAllChunkedPaginatedRows,
  fetchAllPaginatedRows,
  getNotificationSkipReason,
  NOTIFICATION_NO_REGISTERED_PUSH_DEVICES_SKIP_REASON,
} from '@/lib/notifications/cron-helpers';
import {
  type PushDeviceRegistration,
  sendPushNotificationBatch,
} from '@/lib/notifications/push-delivery';

const PROCESSING_DEADLINE_MS = 165_000;
const RESTRICT_TO_ROOT_WORKSPACE_ONLY = true;

const RequestBodySchema = z.object({
  batch_id: z.string().max(MAX_NAME_LENGTH).optional(),
  batch_ids: z.array(z.string()).optional(),
});

type EmailTemplateType =
  | 'workspace-invite'
  | 'deadline-reminder'
  | 'notification-digest';

interface NotificationData {
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

interface RenderTemplateParams {
  notification: NotificationData;
  templateType: EmailTemplateType;
  userName: string;
  workspaceName?: string;
}

interface UserData {
  display_name: string | null;
  email: string | null;
  id: string;
}

interface WorkspaceData {
  id: string;
  name: string | null;
}

interface EmailConfigData {
  email_subject_template: string | null;
  email_template: string | null;
  notification_type: string;
}

interface NotificationBatchRow {
  channel: string;
  email: string | null;
  id: string;
  user_id: string | null;
  window_end: string;
  ws_id: string | null;
}

interface DeliveryLogWithNotification {
  batch_id: string;
  id: string;
  notification_id: string;
  notifications: NotificationData | null;
}

interface NotificationWorkspaceCheckRow {
  batch_id: string | null;
  notifications: {
    data: Record<string, unknown> | null;
    entity_id: string | null;
  } | null;
}

interface PendingDeliveryLogRetryRow {
  id: string;
  retry_count: number | null;
}

interface UserLookupRow {
  display_name: string | null;
  email: Array<{ email: string }> | null;
  id: string;
}

interface WorkspaceLookupRow {
  id: string;
  name: string | null;
}

interface PushDeviceLookupRow {
  token: string;
  user_id: string;
}

function sortDeliveryLogsByCreatedAtDesc(
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

async function markDeliveryLogsSent(sbAdmin: any, logIds: string[]) {
  if (logIds.length === 0) {
    return;
  }

  const patch = {
    status: 'sent',
    sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  for (const idChunk of chunkValues([...new Set(logIds)])) {
    await sbAdmin
      .from('notification_delivery_log')
      .update(patch)
      .in('id', idChunk)
      .eq('status', 'pending');
  }
}

async function markDeliveryLogsSkipped(
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
    await sbAdmin
      .from('notification_delivery_log')
      .update(patch)
      .in('id', idChunk)
      .eq('status', 'pending');
  }
}

async function markBatchSent(
  sbAdmin: any,
  batchId: string,
  notificationCount: number
) {
  await sbAdmin
    .from('notification_batches')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      notification_count: notificationCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId);
}

async function fetchPendingDeliveryLogRetries(
  sbAdmin: any,
  batchId: string
): Promise<PendingDeliveryLogRetryRow[]> {
  return fetchAllPaginatedRows<PendingDeliveryLogRetryRow>((from, to) =>
    sbAdmin
      .from('notification_delivery_log')
      .select('id, retry_count')
      .eq('batch_id', batchId)
      .eq('status', 'pending')
      .order('id', { ascending: true })
      .range(from, to)
  );
}

async function markBatchFailed(sbAdmin: any, batchId: string, message: string) {
  await sbAdmin
    .from('notification_batches')
    .update({
      status: 'failed',
      error_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId);

  const pendingLogs = await fetchPendingDeliveryLogRetries(sbAdmin, batchId);

  for (const log of pendingLogs) {
    await sbAdmin
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

async function cleanupInvalidPushTokens(sbAdmin: any, tokens: string[]) {
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

async function renderEmailTemplate(params: RenderTemplateParams): Promise<{
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

async function fetchPendingImmediateBatches(
  sbAdmin: any,
  batchIds: string[]
): Promise<NotificationBatchRow[]> {
  return fetchAllPaginatedRows<NotificationBatchRow>((from, to) => {
    let query = sbAdmin
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

async function filterRootScopedBatches(
  sbAdmin: any,
  batches: NotificationBatchRow[]
): Promise<NotificationBatchRow[]> {
  if (!RESTRICT_TO_ROOT_WORKSPACE_ONLY || batches.length === 0) {
    return batches;
  }

  const batchesWithWsId = batches.filter((batch) => batch.ws_id !== null);
  const validBatchesWithWsId = batchesWithWsId.filter(
    (batch) => batch.ws_id === ROOT_WORKSPACE_ID
  );
  const batchesWithNullWsId = batches.filter((batch) => batch.ws_id === null);

  if (batchesWithNullWsId.length === 0) {
    return validBatchesWithWsId;
  }

  const deliveryLogsForCheck = await fetchAllChunkedPaginatedRows<
    NotificationWorkspaceCheckRow,
    string
  >(
    batchesWithNullWsId.map((batch) => batch.id),
    (batchIdChunk, from, to) =>
      sbAdmin
        .from('notification_delivery_log')
        .select(
          `
          batch_id,
          notifications (
            entity_id,
            data
          )
        `
        )
        .in('batch_id', batchIdChunk)
        .order('batch_id', { ascending: true })
        .range(from, to),
    {
      chunkSize: 500,
    }
  );

  const validBatchIds = new Set(validBatchesWithWsId.map((batch) => batch.id));
  for (const log of deliveryLogsForCheck) {
    const notification = log.notifications;
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

async function fetchDeliveryLogsForBatches(
  sbAdmin: any,
  batchIds: string[]
): Promise<Map<string, DeliveryLogWithNotification[]>> {
  const deliveryLogs = await fetchAllChunkedPaginatedRows<
    DeliveryLogWithNotification,
    string
  >(
    batchIds,
    (batchIdChunk, from, to) =>
      sbAdmin
        .from('notification_delivery_log')
        .select(
          `
          id,
          batch_id,
          notification_id,
          notifications (
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
          )
        `
        )
        .in('batch_id', batchIdChunk)
        .eq('status', 'pending')
        .order('batch_id', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    {
      chunkSize: 500,
    }
  );

  const deliveryLogsByBatch = new Map<string, DeliveryLogWithNotification[]>();
  for (const log of deliveryLogs) {
    const existingLogs = deliveryLogsByBatch.get(log.batch_id) || [];
    existingLogs.push(log);
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

async function fetchUsersByIds(
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

async function fetchWorkspacesByIds(
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

async function fetchImmediateEmailConfigs(
  sbAdmin: any,
  notificationTypes: string[]
): Promise<Map<string, EmailConfigData>> {
  const emailConfigsMap = new Map<string, EmailConfigData>();

  if (notificationTypes.length === 0) {
    return emailConfigsMap;
  }

  const rows = await fetchAllChunkedPaginatedRows<EmailConfigData, string>(
    notificationTypes,
    (notificationTypeChunk, from, to) =>
      sbAdmin
        .from('notification_email_config')
        .select('notification_type, email_template, email_subject_template')
        .in('notification_type', notificationTypeChunk)
        .eq('delivery_mode', 'immediate')
        .eq('enabled', true)
        .order('notification_type', { ascending: true })
        .range(from, to),
    {
      chunkSize: 500,
    }
  );

  for (const config of rows) {
    emailConfigsMap.set(config.notification_type, config);
  }

  return emailConfigsMap;
}

async function fetchPushDevicesByUserIds(
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

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;
    const isAuthorized =
      (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
      (supabaseServiceKey && authHeader === `Bearer ${supabaseServiceKey}`);

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let batchIds: string[] = [];

    const bodyText = await req.text();
    if (bodyText) {
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(bodyText);
      } catch {
        return NextResponse.json(
          { error: 'Invalid JSON body' },
          { status: 400 }
        );
      }

      const result = RequestBodySchema.safeParse(parsedBody);
      if (!result.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: result.error.issues },
          { status: 400 }
        );
      }

      if (result.data.batch_id) {
        batchIds = [result.data.batch_id];
      } else if (result.data.batch_ids) {
        batchIds = result.data.batch_ids;
      }
    }

    const sbAdmin = await createAdminClient();
    const blockedEmailCache = new Map<string, boolean>();
    const processingDeadline = Date.now() + PROCESSING_DEADLINE_MS;
    const membershipCache = new Map<string, boolean>();

    const batches = await fetchPendingImmediateBatches(sbAdmin, batchIds);

    if (batches.length === 0) {
      return NextResponse.json({
        message: 'No immediate batches to process',
        processed: 0,
      });
    }

    const filteredBatches = await filterRootScopedBatches(sbAdmin, batches);

    if (filteredBatches.length === 0) {
      return NextResponse.json({
        message: 'No immediate batches to process (filtered by root workspace)',
        processed: 0,
      });
    }

    const batchIdList = filteredBatches.map((batch) => batch.id);
    const deliveryLogsByBatch = await fetchDeliveryLogsForBatches(
      sbAdmin,
      batchIdList
    );

    const usersMap = await fetchUsersByIds(sbAdmin, [
      ...new Set(filteredBatches.map((batch) => batch.user_id).filter(Boolean)),
    ] as string[]);

    await preloadBlockedEmailCache(
      sbAdmin,
      filteredBatches
        .filter((batch) => batch.channel === 'email')
        .map((batch) =>
          batch.user_id
            ? (usersMap.get(batch.user_id)?.email ?? null)
            : batch.email
        ),
      blockedEmailCache
    );

    const workspacesMap = await fetchWorkspacesByIds(sbAdmin, [
      ...new Set(filteredBatches.map((batch) => batch.ws_id).filter(Boolean)),
    ] as string[]);

    const notificationTypes = [
      ...new Set(
        [...deliveryLogsByBatch.values()]
          .flat()
          .map(
            (log) => log.notifications?.type || log.notifications?.code || ''
          )
          .filter(Boolean)
      ),
    ];
    const emailConfigsMap = await fetchImmediateEmailConfigs(
      sbAdmin,
      notificationTypes
    );

    const pushDevicesByUser = await fetchPushDevicesByUserIds(sbAdmin, [
      ...new Set(
        filteredBatches
          .filter((batch) => batch.channel === 'push' && batch.user_id)
          .map((batch) => batch.user_id)
      ),
    ] as string[]);

    let processedCount = 0;
    let failedCount = 0;
    const results: Array<{
      batch_id: string;
      channel?: string;
      delivered_count?: number;
      email?: string;
      error?: string;
      status: string;
    }> = [];

    for (const batch of filteredBatches) {
      if (Date.now() > processingDeadline) {
        console.warn(
          '[ImmediateNotificationProcessor] Processing deadline reached before all batches were handled'
        );
        break;
      }

      try {
        await sbAdmin
          .from('notification_batches')
          .update({
            status: 'processing',
            updated_at: new Date().toISOString(),
          })
          .eq('id', batch.id)
          .eq('status', 'pending');

        const deliveryLogs = deliveryLogsByBatch.get(batch.id);

        if (!deliveryLogs || deliveryLogs.length === 0) {
          await markBatchSent(sbAdmin, batch.id, 0);

          results.push({
            batch_id: batch.id,
            channel: batch.channel,
            status: 'skipped',
          });
          processedCount++;
          continue;
        }

        const deliverableLogs: DeliveryLogWithNotification[] = [];
        const skippedByReason = new Map<
          string,
          DeliveryLogWithNotification[]
        >();

        for (const log of deliveryLogs) {
          const logNotification = log.notifications;
          if (!logNotification) {
            continue;
          }

          const skipReason = await getNotificationSkipReason(sbAdmin, {
            blockedEmailCache,
            membershipCache,
            notification: logNotification,
          });

          if (skipReason) {
            const existingLogs = skippedByReason.get(skipReason) || [];
            existingLogs.push(log);
            skippedByReason.set(skipReason, existingLogs);
            continue;
          }

          deliverableLogs.push(log);
        }

        for (const [reason, logs] of skippedByReason.entries()) {
          await markDeliveryLogsSkipped(sbAdmin, logs, reason);
        }

        const skippedCount = [...skippedByReason.values()].reduce(
          (count, logs) => count + logs.length,
          0
        );

        if (deliverableLogs.length === 0) {
          await markBatchSent(sbAdmin, batch.id, skippedCount);

          results.push({
            batch_id: batch.id,
            channel: batch.channel,
            delivered_count: 0,
            status: 'skipped',
          });
          processedCount++;
          continue;
        }

        if (batch.channel === 'push') {
          if (!batch.user_id) {
            throw new Error('Push batch missing user id');
          }

          const devices = pushDevicesByUser.get(batch.user_id) || [];
          if (devices.length === 0) {
            await markDeliveryLogsSkipped(
              sbAdmin,
              deliverableLogs,
              NOTIFICATION_NO_REGISTERED_PUSH_DEVICES_SKIP_REASON
            );
            await markBatchSent(
              sbAdmin,
              batch.id,
              deliverableLogs.length + skippedCount
            );

            results.push({
              batch_id: batch.id,
              channel: 'push',
              delivered_count: 0,
              status: 'skipped',
            });
            processedCount++;
            continue;
          }

          const pushResult = await sendPushNotificationBatch({
            notification: deliverableLogs[0]!.notifications as NotificationData,
            devices,
          });

          await cleanupInvalidPushTokens(sbAdmin, pushResult.invalidTokens);

          if (pushResult.deliveredCount === 0) {
            throw new Error('Failed to deliver push notification');
          }

          await markDeliveryLogsSent(
            sbAdmin,
            deliverableLogs.map((log) => log.id)
          );
          await markBatchSent(
            sbAdmin,
            batch.id,
            deliverableLogs.length + skippedCount
          );

          results.push({
            batch_id: batch.id,
            channel: 'push',
            delivered_count: pushResult.deliveredCount,
            status: 'sent',
          });
        } else {
          const deliverableNotification = deliverableLogs[0]!
            .notifications as NotificationData;

          let userEmail: string;
          let userName: string;

          if (batch.user_id) {
            const user = usersMap.get(batch.user_id);
            userEmail = user?.email || batch.email || '';
            userName = user?.display_name || userEmail;
          } else {
            userEmail = batch.email || '';
            userName = userEmail;
          }

          const preSendSkipReason = await getNotificationSkipReason(sbAdmin, {
            blockedEmailCache,
            membershipCache,
            notification: deliverableNotification,
            recipientEmail: userEmail || null,
          });

          if (preSendSkipReason) {
            await markDeliveryLogsSkipped(
              sbAdmin,
              deliverableLogs,
              preSendSkipReason
            );
            await markBatchSent(
              sbAdmin,
              batch.id,
              deliverableLogs.length + skippedCount
            );

            results.push({
              batch_id: batch.id,
              channel: 'email',
              email: userEmail || undefined,
              status: 'skipped',
            });
            processedCount++;
            continue;
          }

          let workspaceName = 'Tuturuuu';
          if (batch.ws_id) {
            const workspace = workspacesMap.get(batch.ws_id);
            if (workspace) {
              workspaceName = workspace.name || 'Unknown Workspace';
            }
          }

          const notifType =
            deliverableNotification.type || deliverableNotification.code || '';
          const config = emailConfigsMap.get(notifType);

          let emailHtml: string;
          let emailSubject: string;

          if (config?.email_template) {
            const templateResult = await renderEmailTemplate({
              templateType: config.email_template as EmailTemplateType,
              notification: deliverableNotification,
              userName,
              workspaceName,
            });
            emailHtml = templateResult.html;
            emailSubject = templateResult.subject;
          } else {
            emailHtml = await render(
              NotificationDigestEmail({
                userName,
                workspaceName,
                notifications: [
                  {
                    id: deliverableNotification.id,
                    type: deliverableNotification.type,
                    title: deliverableNotification.title,
                    description: deliverableNotification.description ?? '',
                    data: deliverableNotification.data,
                    createdAt: deliverableNotification.created_at,
                  },
                ],
                workspaceUrl:
                  process.env.NEXT_PUBLIC_APP_URL || 'https://tuturuuu.com',
              })
            );
            emailSubject = `New notification from ${workspaceName}`;
          }

          const templateType = config?.email_template || 'notification-digest';
          const result = await sendSystemEmail({
            recipients: { to: [userEmail] },
            content: {
              subject: emailSubject,
              html: emailHtml,
            },
            source: {
              name: 'Tuturuuu',
              email: 'notifications@tuturuuu.com',
            },
            metadata: {
              templateType,
              entityType: 'notification',
              entityId: deliverableNotification.id,
            },
          });

          if (!result.success) {
            const sendSkipReason = await getNotificationSkipReason(sbAdmin, {
              blockedEmailCache,
              errorMessage: result.error,
              membershipCache,
              notification: deliverableNotification,
              recipientEmail: userEmail,
              sendResult: result,
            });

            if (sendSkipReason) {
              await markDeliveryLogsSkipped(
                sbAdmin,
                deliverableLogs,
                sendSkipReason
              );
              await markBatchSent(
                sbAdmin,
                batch.id,
                deliverableLogs.length + skippedCount
              );

              results.push({
                batch_id: batch.id,
                channel: 'email',
                email: userEmail,
                status: 'skipped',
              });
              processedCount++;
              continue;
            }

            throw new Error(result.error || 'Failed to send email');
          }

          await markDeliveryLogsSent(
            sbAdmin,
            deliverableLogs.map((log) => log.id)
          );
          await markBatchSent(
            sbAdmin,
            batch.id,
            deliverableLogs.length + skippedCount
          );

          results.push({
            batch_id: batch.id,
            channel: 'email',
            email: userEmail,
            status: 'sent',
          });
        }

        processedCount++;
      } catch (error) {
        console.error(`Error processing immediate batch ${batch.id}:`, error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        await markBatchFailed(sbAdmin, batch.id, errorMessage);

        results.push({
          batch_id: batch.id,
          channel: batch.channel,
          error: errorMessage,
          status: 'failed',
        });
        failedCount++;
      }
    }

    return NextResponse.json({
      message: 'Immediate notification processing completed',
      processed: processedCount,
      failed: failedCount,
      results,
    });
  } catch (error) {
    console.error('Error in immediate notification processor:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
