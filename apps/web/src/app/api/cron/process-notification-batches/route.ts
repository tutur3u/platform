import { render } from '@react-email/render';
import { sendSystemEmail } from '@tuturuuu/email-service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import NotificationDigestEmail, {
  generateSubjectLine,
  type NotificationItem,
} from '@tuturuuu/transactional/emails/notification-digest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  fetchTaskStateMap,
  getNotificationBatchRecipientKey,
  getQueuedNotificationActionUrl,
  markBatchesSkipped,
  markDeliveryLogsFailedForBatches,
  markDeliveryLogsSkipped,
  type NotificationBatchRecipient,
  planQueuedNotifications,
  type QueuedNotification,
} from '@/app/api/notifications/delivery-utils';

const MAX_BATCH_SEEDS = 1000;
const MAX_RECIPIENTS_PER_RUN = 250;

interface NotificationBatchRow {
  id: string;
  ws_id: string | null;
  user_id: string | null;
  email: string | null;
  channel: string;
  status: string;
  window_start: string;
  window_end: string;
}

interface DeliveryLogRow {
  id: string;
  batch_id: string;
  notification_id: string;
  notifications: {
    id: string;
    type: string;
    title: string;
    description: string | null;
    data: Record<string, unknown> | null;
    created_at: string;
    entity_id: string | null;
    entity_type: string | null;
    action_url: string | null;
  } | null;
}

interface UserRow {
  id: string;
  display_name: string | null;
  email: Array<{ email: string }> | null;
}

const getRecipientFromBatch = (
  batch: Pick<NotificationBatchRow, 'ws_id' | 'user_id' | 'email' | 'channel'>
): NotificationBatchRecipient => ({
  wsId: batch.ws_id,
  userId: batch.user_id,
  email: batch.email,
  channel: batch.channel,
});

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sbAdmin = await createAdminClient();
    const nowIso = new Date().toISOString();

    const seedQuery = sbAdmin
      .from('notification_batches')
      .select(
        'id, ws_id, user_id, email, channel, status, window_start, window_end'
      )
      .eq('status', 'pending')
      .eq('delivery_mode', 'batched')
      .lte('window_end', nowIso);

    const { data: seedBatches, error: batchesError } = await seedQuery
      .order('window_end', { ascending: true })
      .limit(MAX_BATCH_SEEDS);

    if (batchesError) {
      console.error('Error fetching batch seeds:', batchesError);
      return NextResponse.json(
        { error: 'Error fetching batches', processed: 0, failed: 0 },
        { status: 500 }
      );
    }

    const filteredSeedBatches = (seedBatches || []) as NotificationBatchRow[];

    if (filteredSeedBatches.length === 0) {
      return NextResponse.json({
        message: 'No pending batched notifications to process',
        processed: 0,
        failed: 0,
      });
    }

    const recipientSeeds = new Map<string, NotificationBatchRow>();
    for (const batch of filteredSeedBatches) {
      const key = getNotificationBatchRecipientKey(
        getRecipientFromBatch(batch)
      );
      if (!recipientSeeds.has(key)) {
        recipientSeeds.set(key, batch);
      }
    }

    const recipientBatchSeeds = Array.from(recipientSeeds.values()).slice(
      0,
      MAX_RECIPIENTS_PER_RUN
    );

    let processedCount = 0;
    let failedCount = 0;
    const results: Array<{
      batch_id: string;
      status: string;
      email?: string;
      notification_count?: number;
      merged_batches?: number;
      reason?: string;
      error?: string;
    }> = [];

    for (const seedBatch of recipientBatchSeeds) {
      let activeBatchId = seedBatch.id;
      let recipientBatchIds: string[] = [seedBatch.id];

      try {
        let recipientBatchQuery = sbAdmin
          .from('notification_batches')
          .select(
            'id, ws_id, user_id, email, channel, status, window_start, window_end'
          )
          .eq('status', 'pending')
          .eq('delivery_mode', 'batched')
          .eq('channel', seedBatch.channel)
          .lte('window_end', nowIso)
          .order('window_end', { ascending: false });

        if (seedBatch.ws_id) {
          recipientBatchQuery = recipientBatchQuery.eq(
            'ws_id',
            seedBatch.ws_id
          );
        } else {
          recipientBatchQuery = recipientBatchQuery.is('ws_id', null);
        }

        if (seedBatch.user_id) {
          recipientBatchQuery = recipientBatchQuery.eq(
            'user_id',
            seedBatch.user_id
          );
        } else {
          recipientBatchQuery = recipientBatchQuery
            .is('user_id', null)
            .eq('email', seedBatch.email || '');
        }

        const { data: allRecipientBatches, error: recipientBatchesError } =
          await recipientBatchQuery;

        if (recipientBatchesError) {
          throw recipientBatchesError;
        }

        const recipientBatches = (allRecipientBatches ||
          []) as NotificationBatchRow[];

        if (recipientBatches.length === 0) {
          continue;
        }

        const latestBatch = recipientBatches[0]!;
        activeBatchId = latestBatch.id;
        recipientBatchIds = recipientBatches.map((batch) => batch.id);
        const olderBatchIds = recipientBatches
          .slice(1)
          .map((batch) => batch.id);

        await sbAdmin
          .from('notification_batches')
          .update({
            status: 'processing',
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', latestBatch.id)
          .eq('status', 'pending');

        const { data: deliveryLogs, error: logsError } = await sbAdmin
          .from('notification_delivery_log')
          .select(
            `
              id,
              batch_id,
              notification_id,
              notifications:notifications!notification_delivery_log_notification_id_fkey (
                id,
                type,
                title,
                description,
                data,
                created_at,
                entity_id,
                entity_type,
                action_url
              )
            `
          )
          .in(
            'batch_id',
            recipientBatches.map((batch) => batch.id)
          )
          .eq('status', 'pending')
          .eq('channel', 'email');

        if (logsError) {
          throw logsError;
        }

        if (!deliveryLogs || deliveryLogs.length === 0) {
          await markBatchesSkipped(sbAdmin, olderBatchIds, {
            reason: 'consolidated_to_latest_batch',
            consolidatedIntoBatchId: latestBatch.id,
          });
          await markBatchesSkipped(sbAdmin, [latestBatch.id], {
            reason: 'no_notifications',
          });

          results.push({
            batch_id: latestBatch.id,
            status: 'skipped',
            merged_batches: recipientBatches.length,
            reason: 'no_notifications',
          });
          processedCount++;
          continue;
        }

        const queuedNotifications: QueuedNotification[] = [];
        for (const deliveryLog of deliveryLogs as DeliveryLogRow[]) {
          const notification = deliveryLog.notifications;
          if (!notification) {
            continue;
          }

          queuedNotifications.push({
            deliveryLogId: deliveryLog.id,
            batchId: deliveryLog.batch_id,
            notificationId: deliveryLog.notification_id,
            type: notification.type,
            title: notification.title,
            description: notification.description,
            data: notification.data,
            createdAt: notification.created_at,
            entityId: notification.entity_id,
            entityType: notification.entity_type,
            actionUrl: notification.action_url ?? null,
          });
        }

        const taskStateMap = await fetchTaskStateMap(
          sbAdmin,
          queuedNotifications
        );
        const plan = planQueuedNotifications(
          queuedNotifications,
          taskStateMap,
          new Date(nowIso)
        );

        const staleSkipped = plan.skipped.filter(
          (entry) => entry.reason !== 'consolidated_to_latest'
        );
        const consolidatedSkipped = plan.skipped.filter(
          (entry) => entry.reason === 'consolidated_to_latest'
        );

        await markDeliveryLogsSkipped(sbAdmin, staleSkipped);
        await markDeliveryLogsSkipped(sbAdmin, consolidatedSkipped);
        await markBatchesSkipped(sbAdmin, olderBatchIds, {
          reason: 'consolidated_to_latest_batch',
          consolidatedIntoBatchId: latestBatch.id,
        });

        if (plan.notificationsToSend.length === 0) {
          await markBatchesSkipped(sbAdmin, [latestBatch.id], {
            reason: staleSkipped[0]?.reason || 'task_inactive',
          });

          results.push({
            batch_id: latestBatch.id,
            status: 'skipped',
            merged_batches: recipientBatches.length,
            reason: staleSkipped[0]?.reason || 'task_inactive',
          });
          processedCount++;
          continue;
        }

        let userEmail: string;
        let userName: string;

        if (latestBatch.user_id) {
          const { data: user } = await sbAdmin
            .from('users')
            .select('id, display_name, email:user_private_details(email)')
            .eq('id', latestBatch.user_id)
            .single();

          const typedUser = user as UserRow | null;
          userEmail = typedUser?.email?.[0]?.email || latestBatch.email || '';
          userName = typedUser?.display_name || userEmail;
        } else {
          userEmail = latestBatch.email || '';
          userName = userEmail;
        }

        if (!userEmail) {
          throw new Error('No email address found for batch');
        }

        let workspaceName = 'Tuturuuu';
        let workspaceUrl =
          process.env.NEXT_PUBLIC_APP_URL || 'https://tuturuuu.com';

        if (latestBatch.ws_id) {
          const { data: workspace } = await sbAdmin
            .from('workspaces')
            .select('name')
            .eq('id', latestBatch.ws_id)
            .single();

          workspaceName = workspace?.name || workspaceName;
          workspaceUrl = `${workspaceUrl}/${latestBatch.ws_id}`;
        }

        const notifications: NotificationItem[] = plan.notificationsToSend.map(
          (notification) => ({
            id: notification.notificationId,
            type: notification.type,
            title: notification.title,
            description: notification.description || '',
            data: notification.data || {},
            createdAt: notification.createdAt,
            actionUrl: getQueuedNotificationActionUrl(notification),
            isConsolidated: notification.isConsolidated,
            consolidatedCount: notification.consolidatedCount,
            changeTypes: notification.changeTypes,
          })
        );

        const sentAt = new Date().toISOString();
        const emailSubject = generateSubjectLine(notifications, workspaceName);
        const emailHtml = await render(
          NotificationDigestEmail({
            userName,
            workspaceName,
            notifications,
            workspaceUrl,
            windowStart:
              recipientBatches[recipientBatches.length - 1]?.window_start,
            windowEnd: latestBatch.window_end,
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
            entityId: latestBatch.id,
          },
        });

        if (!result.success) {
          if (result.blockedRecipients && result.blockedRecipients.length > 0) {
            throw new Error(
              `Email blocked: ${result.blockedRecipients[0]?.reason || 'unknown'}`
            );
          }

          throw new Error(result.error || 'Failed to send email');
        }

        await sbAdmin
          .from('notification_delivery_log')
          .update({
            status: 'sent',
            sent_at: sentAt,
            updated_at: sentAt,
          } as never)
          .in(
            'id',
            plan.notificationsToSend.map(
              (notification) => notification.deliveryLogId
            )
          )
          .eq('status', 'pending');

        await sbAdmin
          .from('notification_batches')
          .update({
            status: 'sent',
            sent_at: sentAt,
            notification_count: notifications.length,
            updated_at: sentAt,
          } as never)
          .eq('id', latestBatch.id);

        results.push({
          batch_id: latestBatch.id,
          status: 'sent',
          email: userEmail,
          notification_count: notifications.length,
          merged_batches: recipientBatches.length,
        });
        processedCount++;
      } catch (error) {
        console.error(
          `Error processing batched notification recipient ${seedBatch.id}:`,
          error
        );

        await sbAdmin
          .from('notification_batches')
          .update({
            status: 'failed',
            error_message:
              error instanceof Error ? error.message : 'Unknown error',
            updated_at: new Date().toISOString(),
          } as never)
          .in('id', recipientBatchIds)
          .in('status', ['pending', 'processing']);

        await markDeliveryLogsFailedForBatches(
          sbAdmin,
          recipientBatchIds,
          error instanceof Error ? error.message : 'Unknown error'
        );

        results.push({
          batch_id: activeBatchId,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
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
