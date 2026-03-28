import { render } from '@react-email/render';
import { sendSystemEmail } from '@tuturuuu/email-service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import NotificationDigestEmail, {
  generateSubjectLine,
  type NotificationItem,
} from '@tuturuuu/transactional/emails/notification-digest';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { preloadBlockedEmailCache } from '@/lib/email-blacklist';
import {
  chunkValues,
  fetchAllChunkedPaginatedRows,
  fetchAllPaginatedRows,
  getNotificationSkipReason,
} from '@/lib/notifications/cron-helpers';
import { sendPushNotificationBatch } from '@/lib/notifications/push-delivery';

const PROCESSING_DEADLINE_MS = 165_000;
const RESTRICT_TO_ROOT_WORKSPACE_ONLY = true;

type NotificationBatchRow = {
  channel: string;
  email: string | null;
  id: string;
  user_id: string | null;
  window_end: string;
  window_start: string;
  ws_id: string | null;
};

type BatchNotificationRow = {
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

type DeliveryLogRow = {
  batch_id?: string | null;
  id: string;
  notification_id: string;
  notifications: BatchNotificationRow | null;
};

type NotificationWorkspaceCheckRow = {
  batch_id: string | null;
  notifications: {
    data: Record<string, unknown> | null;
    entity_id: string | null;
  } | null;
};

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

async function fetchPendingBatchedNotificationBatches(
  sbAdmin: any
): Promise<NotificationBatchRow[]> {
  return fetchAllPaginatedRows<NotificationBatchRow>((from, to) => {
    let query = sbAdmin
      .from('notification_batches')
      .select('*')
      .eq('status', 'pending')
      .eq('delivery_mode', 'batched')
      .lte('window_end', new Date().toISOString());

    if (RESTRICT_TO_ROOT_WORKSPACE_ONLY) {
      query = query.or(`ws_id.eq.${ROOT_WORKSPACE_ID},ws_id.is.null`);
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
  const batchesWithNullWsId = batches.filter((batch) => batch.ws_id === null);

  if (batchesWithNullWsId.length === 0) {
    return batchesWithWsId;
  }

  const nullWsIdBatchIds = batchesWithNullWsId.map((batch) => batch.id);
  const deliveryLogsForCheck = await fetchAllChunkedPaginatedRows<
    NotificationWorkspaceCheckRow,
    string
  >(
    nullWsIdBatchIds,
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

  const validBatchIds = new Set<string>(
    batchesWithWsId.map((batch) => batch.id)
  );
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

async function fetchPendingBatchDeliveryLogs(
  sbAdmin: any,
  batchId: string,
  channel: string
): Promise<DeliveryLogRow[]> {
  const deliveryLogs = await fetchAllPaginatedRows<DeliveryLogRow>((from, to) =>
    sbAdmin
      .from('notification_delivery_log')
      .select(
        `
        batch_id,
        notification_id,
        id,
        notifications (
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
        )
      `
      )
      .eq('batch_id', batchId)
      .eq('status', 'pending')
      .eq('channel', channel)
      .order('id', { ascending: true })
      .range(from, to)
  );

  return sortDeliveryLogsByCreatedAtDesc(deliveryLogs);
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

async function fetchPushDevicesForUser(
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

async function fetchUsersByIds(
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

async function markDeliveryLogsSentByIds(
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
      await sbAdmin
        .from('notification_delivery_log')
        .update(patch)
        .in('id', idChunk)
        .eq('status', 'pending');
    }
    return;
  }

  if (!batchId) {
    return;
  }

  await sbAdmin
    .from('notification_delivery_log')
    .update(patch)
    .eq('batch_id', batchId)
    .eq('status', 'pending');
}

async function markDeliveryLogsSkipped(
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

async function markBatchFailed(sbAdmin: any, batchId: string, message: string) {
  await sbAdmin
    .from('notification_batches')
    .update({
      status: 'failed',
      error_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', batchId);

  const failedLogs = await fetchPendingDeliveryLogRetries(sbAdmin, batchId);

  for (const log of failedLogs) {
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

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sbAdmin = await createAdminClient();
    const processingDeadline = Date.now() + PROCESSING_DEADLINE_MS;
    const blockedEmailCache = new Map<string, boolean>();
    const membershipCache = new Map<string, boolean>();

    const batches = await fetchPendingBatchedNotificationBatches(sbAdmin);

    if (batches.length === 0) {
      return NextResponse.json({
        message: 'No pending batched notifications to process',
        processed: 0,
        failed: 0,
      });
    }

    const filteredBatches = await filterRootScopedBatches(sbAdmin, batches);

    if (filteredBatches.length === 0) {
      return NextResponse.json({
        message:
          'No pending batched notifications to process (filtered by root workspace)',
        processed: 0,
        failed: 0,
      });
    }

    const usersMap = await fetchUsersByIds(sbAdmin, [
      ...new Set(
        filteredBatches
          .filter((batch) => batch.channel === 'email')
          .map((batch) => batch.user_id)
          .filter(Boolean)
      ),
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

    let processedCount = 0;
    let failedCount = 0;
    const results: Array<{
      batch_id: string;
      channel?: string;
      delivered_count?: number;
      email?: string;
      error?: string;
      notification_count?: number;
      reason?: string;
      status: string;
    }> = [];

    for (const batch of filteredBatches) {
      if (Date.now() > processingDeadline) {
        console.warn(
          '[NotificationBatchCron] Processing deadline reached before all batches were handled'
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

        const deliveryLogs = await fetchPendingBatchDeliveryLogs(
          sbAdmin,
          batch.id,
          batch.channel
        );

        if (deliveryLogs.length === 0) {
          await markBatchSent(sbAdmin, batch.id, 0);

          results.push({
            batch_id: batch.id,
            channel: batch.channel,
            reason: 'no_notifications',
            status: 'skipped',
          });
          processedCount++;
          continue;
        }

        const deliverableLogs: DeliveryLogRow[] = [];
        const skippedByReason = new Map<string, DeliveryLogRow[]>();

        for (const log of deliveryLogs) {
          const notification = log.notifications;
          if (!notification) {
            continue;
          }

          const skipReason = await getNotificationSkipReason(sbAdmin, {
            blockedEmailCache,
            membershipCache,
            notification,
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
          await markDeliveryLogsSkipped(
            sbAdmin,
            logs.map((log) => log.id),
            reason
          );
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
            notification_count: skippedCount,
            reason: 'all_notifications_skipped',
            status: 'skipped',
          });
          processedCount++;
          continue;
        }

        const notifications: NotificationItem[] = deliverableLogs
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

        if (batch.channel === 'push') {
          if (!batch.user_id) {
            throw new Error('Push batch missing user id');
          }

          const devices = await fetchPushDevicesForUser(sbAdmin, batch.user_id);

          if (devices.length === 0) {
            throw new Error('No registered push devices found for batch');
          }

          const latestNotification = deliverableLogs[0]!.notifications!;
          const latestNotificationData =
            latestNotification.data &&
            typeof latestNotification.data === 'object'
              ? latestNotification.data
              : {};
          const pushNotification = {
            ...latestNotification,
            entity_type: null,
            entity_id: null,
            data: {
              ...latestNotificationData,
              board_id: null,
            },
          };

          const pushResult = await sendPushNotificationBatch({
            notification: pushNotification,
            devices,
          });

          await cleanupInvalidPushTokens(sbAdmin, pushResult.invalidTokens);

          if (pushResult.deliveredCount === 0) {
            throw new Error('Failed to deliver batched push notification');
          }

          await markDeliveryLogsSentByIds(
            sbAdmin,
            deliverableLogs.map((log) => log.id)
          );
          await markBatchSent(
            sbAdmin,
            batch.id,
            notifications.length + skippedCount
          );

          results.push({
            batch_id: batch.id,
            channel: 'push',
            delivered_count: pushResult.deliveredCount,
            notification_count: notifications.length,
            status: 'sent',
          });
        } else {
          const batchNotification = deliverableLogs[0]!.notifications!;
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
            notification: batchNotification,
            recipientEmail: userEmail || null,
          });

          if (preSendSkipReason) {
            await markDeliveryLogsSkipped(
              sbAdmin,
              deliverableLogs.map((log) => log.id),
              preSendSkipReason
            );
            await markBatchSent(
              sbAdmin,
              batch.id,
              notifications.length + skippedCount
            );

            results.push({
              batch_id: batch.id,
              channel: 'email',
              email: userEmail || undefined,
              notification_count: notifications.length + skippedCount,
              reason: preSendSkipReason,
              status: 'skipped',
            });
            processedCount++;
            continue;
          }

          let workspaceName = 'Tuturuuu';
          let workspaceUrl =
            process.env.NEXT_PUBLIC_APP_URL || 'https://tuturuuu.com';

          if (batch.ws_id) {
            const { data: workspace } = await sbAdmin
              .from('workspaces')
              .select('name')
              .eq('id', batch.ws_id)
              .single();

            if (workspace) {
              workspaceName = workspace.name || 'Unknown Workspace';
              workspaceUrl = `${workspaceUrl}/${batch.ws_id}`;
            }
          }

          const emailSubject = generateSubjectLine(
            notifications,
            workspaceName
          );
          const sentAt = new Date().toISOString();
          const emailHtml = await render(
            NotificationDigestEmail({
              userName,
              workspaceName,
              notifications,
              workspaceUrl,
              windowStart: batch.window_start,
              windowEnd: batch.window_end,
              sentAt,
            })
          );

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
              templateType: 'notification-digest',
              entityType: 'batch',
              entityId: batch.id,
            },
          });

          if (!result.success) {
            const sendSkipReason = await getNotificationSkipReason(sbAdmin, {
              blockedEmailCache,
              errorMessage: result.error,
              membershipCache,
              notification: batchNotification,
              recipientEmail: userEmail,
              sendResult: result,
            });

            if (sendSkipReason) {
              await markDeliveryLogsSkipped(
                sbAdmin,
                deliverableLogs.map((log) => log.id),
                sendSkipReason
              );
              await markBatchSent(
                sbAdmin,
                batch.id,
                notifications.length + skippedCount
              );

              results.push({
                batch_id: batch.id,
                channel: 'email',
                email: userEmail,
                notification_count: notifications.length + skippedCount,
                reason: sendSkipReason,
                status: 'skipped',
              });
              processedCount++;
              continue;
            }

            throw new Error(result.error || 'Failed to send email');
          }

          await markDeliveryLogsSentByIds(
            sbAdmin,
            deliverableLogs.map((log) => log.id)
          );
          await markBatchSent(
            sbAdmin,
            batch.id,
            notifications.length + skippedCount
          );

          results.push({
            batch_id: batch.id,
            channel: 'email',
            email: userEmail,
            notification_count: notifications.length,
            status: 'sent',
          });
        }

        processedCount++;
      } catch (error) {
        console.error(`Error processing batch ${batch.id}:`, error);
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
      message: 'Batch processing completed',
      processed: processedCount,
      failed: failedCount,
      results,
    });
  } catch (error) {
    console.error('Error in notification batch processor:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
