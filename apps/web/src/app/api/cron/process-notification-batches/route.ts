import { render } from '@react-email/render';
import { sendSystemEmail } from '@tuturuuu/email-service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import NotificationDigestEmail, {
  generateSubjectLine,
} from '@tuturuuu/transactional/emails/notification-digest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { preloadBlockedEmailCache } from '@/lib/email-blacklist';
import { withCronLogDrain } from '@/lib/infrastructure/log-drain';
import {
  buildNotificationItems,
  cleanupInvalidPushTokens,
  type DeliveryLogRow,
  fetchPendingBatchDeliveryLogs,
  fetchPendingBatchedNotificationBatches,
  fetchPushDevicesForUser,
  fetchUsersByIds,
  filterRootScopedBatches,
  getPrivateNotificationClient,
  markBatchFailed,
  markBatchSent,
  markDeliveryLogsSentByIds,
  markDeliveryLogsSkipped,
  PROCESSING_DEADLINE_MS,
} from '@/lib/notifications/batched-helpers';
import {
  getNotificationSkipReason,
  NOTIFICATION_NO_REGISTERED_PUSH_DEVICES_SKIP_REASON,
} from '@/lib/notifications/cron-helpers';

import { filterEmailDeliveryLogs } from '@/lib/notifications/email-delivery-filter';
import { sendPushNotificationBatch } from '@/lib/notifications/push-delivery';

export async function GET(req: NextRequest) {
  return withCronLogDrain(
    {
      jobId: 'process-notification-batches',
      path: '/api/cron/process-notification-batches',
      request: req,
    },
    () => handleGET(req)
  );
}

async function handleGET(req: NextRequest) {
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
        await getPrivateNotificationClient(sbAdmin)
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

        let deliverableLogs: DeliveryLogRow[] = [];
        const skippedByReason = new Map<string, DeliveryLogRow[]>();

        for (const log of deliveryLogs) {
          const notification = log.notifications;
          if (!notification) {
            continue;
          }

          const skipReason = await getNotificationSkipReason(sbAdmin, {
            blockedEmailCache,
            channel: batch.channel,
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

        let skippedCount = [...skippedByReason.values()].reduce(
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

        let notifications = buildNotificationItems(deliverableLogs);

        if (batch.channel === 'push') {
          if (!batch.user_id) {
            throw new Error('Push batch missing user id');
          }

          const devices = await fetchPushDevicesForUser(sbAdmin, batch.user_id);

          if (devices.length === 0) {
            await markDeliveryLogsSkipped(
              sbAdmin,
              deliverableLogs.map((log) => log.id),
              NOTIFICATION_NO_REGISTERED_PUSH_DEVICES_SKIP_REASON
            );
            await markBatchSent(
              sbAdmin,
              batch.id,
              notifications.length + skippedCount
            );

            results.push({
              batch_id: batch.id,
              channel: 'push',
              notification_count: notifications.length + skippedCount,
              reason: NOTIFICATION_NO_REGISTERED_PUSH_DEVICES_SKIP_REASON,
              status: 'skipped',
            });
            processedCount++;
            continue;
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

          const finalEmailLogs = await filterEmailDeliveryLogs(
            deliverableLogs,
            (log) =>
              getNotificationSkipReason(sbAdmin, {
                blockedEmailCache,
                channel: 'email',
                membershipCache,
                notification: log.notifications!,
                recipientEmail: userEmail || null,
              }),
            (logs, reason) =>
              markDeliveryLogsSkipped(
                sbAdmin,
                logs.map((log) => log.id),
                reason
              )
          );
          deliverableLogs = finalEmailLogs.deliverableLogs;
          skippedCount += finalEmailLogs.skippedCount;
          notifications = buildNotificationItems(deliverableLogs);
          if (deliverableLogs.length === 0) {
            await markBatchSent(sbAdmin, batch.id, skippedCount);
            results.push({
              batch_id: batch.id,
              channel: 'email',
              email: userEmail || undefined,
              notification_count: skippedCount,
              reason: 'all_notifications_skipped',
              status: 'skipped',
            });
            processedCount++;
            continue;
          }
          const batchNotification = deliverableLogs[0]!.notifications!;

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
