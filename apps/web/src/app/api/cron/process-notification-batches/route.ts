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
import { sendPushNotificationBatch } from '@/lib/notifications/push-delivery';

// This API route should be called by a cron job (pg_cron, Trigger.dev, or external cron service)
// It processes BATCHED notification batches and sends email digests
// Immediate notifications are handled by /api/notifications/send-immediate

// Feature flag: When true, only send emails for notifications belonging to the root workspace
// Set to false to allow emails for all workspaces
const RESTRICT_TO_ROOT_WORKSPACE_ONLY = true;

async function markDeliveryLogsSentByIds(
  sbAdmin: any,
  logIds: string[],
  batchId?: string
) {
  if (logIds.length === 0 && !batchId) {
    return;
  }

  let query = sbAdmin.from('notification_delivery_log').update({
    status: 'sent',
    sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (logIds.length > 0) {
    query = query.in('id', logIds);
  } else if (batchId) {
    query = query.eq('batch_id', batchId);
  }

  await query.eq('status', 'pending');
}

async function markDeliveryLogsSkipped(
  sbAdmin: any,
  logIds: string[],
  reason: string
) {
  if (logIds.length === 0) {
    return;
  }

  await sbAdmin
    .from('notification_delivery_log')
    .update({
      error_message: reason,
      sent_at: new Date().toISOString(),
      status: 'sent',
      updated_at: new Date().toISOString(),
    })
    .in('id', logIds)
    .eq('status', 'pending');
}

const NOTIFICATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function getAgeSkipReason(notification: { created_at: string }): string | null {
  const createdAt = new Date(notification.created_at);
  if (Number.isNaN(createdAt.getTime())) {
    return null;
  }

  return Date.now() - createdAt.getTime() > NOTIFICATION_MAX_AGE_MS
    ? 'skipped: older_than_1_day'
    : null;
}

async function getSkipReason(
  sbAdmin: any,
  notification: {
    id: string;
    scope?: string | null;
    user_id?: string | null;
    ws_id?: string | null;
    created_at: string;
  }
) {
  const ageReason = getAgeSkipReason(notification);
  if (ageReason) {
    return ageReason;
  }

  if (
    notification.scope !== 'workspace' ||
    !notification.user_id ||
    !notification.ws_id
  ) {
    return null;
  }

  const { data: membership, error } = await sbAdmin
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', notification.ws_id)
    .eq('user_id', notification.user_id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to verify workspace membership for notification ${notification.id}: ${error.message}`
    );
  }

  return membership ? null : 'skipped: stale_workspace_membership';
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

  const { data: failedLogs } = await sbAdmin
    .from('notification_delivery_log')
    .select('id, retry_count')
    .eq('batch_id', batchId)
    .eq('status', 'pending');

  if (failedLogs) {
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
}

async function cleanupInvalidPushTokens(sbAdmin: any, tokens: string[]) {
  if (tokens.length === 0) {
    return;
  }

  const { error } = await sbAdmin
    .from('notification_push_devices')
    .delete()
    .in('token', [...new Set(tokens)]);

  if (error) {
    console.error('Failed to delete invalid push tokens:', error);
  }
}

export async function GET(req: NextRequest) {
  try {
    // Verify the request is authorized (check for cron secret)
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sbAdmin = await createAdminClient();

    // Get all pending BATCHED notifications where window_end has passed
    // Immediate notifications are handled separately by /api/notifications/send-immediate
    // When restricted to root workspace, we filter at the query level to ensure we get
    // the correct batches (otherwise limit(50) might return non-root batches first)
    let batchesQuery = sbAdmin
      .from('notification_batches')
      .select('*')
      .eq('status', 'pending')
      .eq('delivery_mode', 'batched')
      .lte('window_end', new Date().toISOString());

    // Filter by root workspace at query level to ensure we get correct batches
    // This is important because limit(50) + post-fetch filtering could miss root
    // workspace batches if non-root batches have earlier window_end times.
    // We also include null ws_id batches since they might be user-scoped notifications
    // (like workspace invites) where the workspace ID is in the notification data.
    if (RESTRICT_TO_ROOT_WORKSPACE_ONLY) {
      batchesQuery = batchesQuery.or(
        `ws_id.eq.${ROOT_WORKSPACE_ID},ws_id.is.null`
      );
    }

    const { data: batches, error: batchesError } = await batchesQuery
      .order('window_end', { ascending: true })
      .limit(50); // Process max 50 batches per run

    if (batchesError) {
      console.error('Error fetching batches:', batchesError);
      return NextResponse.json(
        { error: 'Error fetching batches', processed: 0, failed: 0 },
        { status: 500 }
      );
    }

    if (!batches || batches.length === 0) {
      return NextResponse.json({
        message: 'No pending batched notifications to process',
        processed: 0,
        failed: 0,
      });
    }

    // If restricted to root workspace, we've already filtered at query level
    // (ws_id = ROOT_WORKSPACE_ID or ws_id IS NULL). For null ws_id batches,
    // we need additional filtering based on notification entity_id/data
    let filteredBatches = batches;

    if (RESTRICT_TO_ROOT_WORKSPACE_ONLY) {
      // Separate batches by whether ws_id is null
      const batchesWithWsId = batches.filter((b) => b.ws_id !== null);
      const batchesWithNullWsId = batches.filter((b) => b.ws_id === null);

      // Batches with ws_id already match ROOT_WORKSPACE_ID (from query filter)
      // For null ws_id batches, check notification's entity_id or data->workspace_id
      const validBatchIdsFromNullWsId: string[] = [];

      if (batchesWithNullWsId.length > 0) {
        const batchIdsToCheck = batchesWithNullWsId.map((b) => b.id);

        // Get notifications for these batches to check their entity_id/data
        const { data: deliveryLogsForCheck } = await sbAdmin
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
          .in('batch_id', batchIdsToCheck);

        if (deliveryLogsForCheck) {
          for (const log of deliveryLogsForCheck) {
            const notification = log.notifications as {
              entity_id: string | null;
              data: Record<string, unknown> | null;
            } | null;
            if (notification && log.batch_id) {
              // Check entity_id first, then data->workspace_id
              const workspaceId =
                notification.entity_id ||
                (notification.data?.workspace_id as string | undefined);

              if (workspaceId === ROOT_WORKSPACE_ID) {
                validBatchIdsFromNullWsId.push(log.batch_id);
              }
            }
          }
        }
      }

      // Combine: all non-null ws_id batches (already filtered at query) + valid null ws_id batches
      const validBatchIds = new Set([
        ...batchesWithWsId.map((b) => b.id),
        ...validBatchIdsFromNullWsId,
      ]);

      filteredBatches = batches.filter((b) => validBatchIds.has(b.id));

      if (filteredBatches.length === 0) {
        return NextResponse.json({
          message:
            'No pending batched notifications to process (filtered by root workspace)',
          processed: 0,
          failed: 0,
        });
      }
    }

    let processedCount = 0;
    let failedCount = 0;
    const results: Array<{
      batch_id: string;
      status: string;
      channel?: string;
      email?: string;
      delivered_count?: number;
      notification_count?: number;
      reason?: string;
      error?: string;
    }> = [];

    // Process each batch
    for (const batch of filteredBatches) {
      try {
        // Mark batch as processing
        await sbAdmin
          .from('notification_batches')
          .update({
            status: 'processing',
            updated_at: new Date().toISOString(),
          })
          .eq('id', batch.id)
          .eq('status', 'pending'); // Double-check status hasn't changed

        // Get all pending notifications for this batch
        const { data: deliveryLogs, error: logsError } = await sbAdmin
          .from('notification_delivery_log')
          .select(
            `
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
          .eq('batch_id', batch.id)
          .eq('status', 'pending')
          .eq('channel', batch.channel)
          .order('notifications(created_at)', { ascending: false });

        if (logsError || !deliveryLogs || deliveryLogs.length === 0) {
          await markBatchSent(sbAdmin, batch.id, 0);

          results.push({
            batch_id: batch.id,
            status: 'skipped',
            channel: batch.channel,
            reason: 'no_notifications',
          });
          processedCount++;
          continue;
        }

        const deliverableLogs = [];
        const skippedByReason = new Map<string, typeof deliveryLogs>();

        for (const log of deliveryLogs) {
          const notification = log.notifications as {
            created_at: string;
            id: string;
            scope?: string | null;
            user_id?: string | null;
            ws_id?: string | null;
          } | null;

          if (!notification) {
            continue;
          }

          const skipReason = await getSkipReason(sbAdmin, notification);
          if (skipReason) {
            const existing = skippedByReason.get(skipReason) || [];
            existing.push(log);
            skippedByReason.set(skipReason, existing);
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
            status: 'skipped',
            channel: batch.channel,
            notification_count: skippedCount,
            reason: 'all_notifications_skipped',
          });
          processedCount++;
          continue;
        }

        const notifications: NotificationItem[] = deliverableLogs
          .map((log) => log.notifications)
          .filter(Boolean)
          .map((n) => {
            const data = n.data as Record<string, unknown>;
            // Build action URL from notification data if available
            const actionUrl =
              (data?.action_url as string) ||
              (data?.url as string) ||
              (data?.link as string) ||
              undefined;

            return {
              id: n.id,
              type: n.type,
              title: n.title,
              description: n.description || '',
              data,
              createdAt: n.created_at,
              actionUrl,
            };
          });

        if (batch.channel === 'push') {
          if (!batch.user_id) {
            throw new Error('Push batch missing user id');
          }

          const { data: devices, error: devicesError } = await sbAdmin
            .from('notification_push_devices')
            .select('token')
            .eq('user_id', batch.user_id);

          if (devicesError) {
            throw new Error(
              `Failed to load push devices: ${devicesError.message}`
            );
          }

          if (!devices || devices.length === 0) {
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
            status: 'sent',
            channel: 'push',
            delivered_count: pushResult.deliveredCount,
            notification_count: notifications.length,
          });
        } else {
          let userEmail: string;
          let userName: string;

          if (batch.user_id) {
            const { data: user } = await sbAdmin
              .from('users')
              .select('email:user_private_details(email), display_name')
              .eq('id', batch.user_id)
              .single();

            const emailData = user?.email as unknown as Array<{
              email: string;
            }>;
            userEmail = emailData?.[0]?.email || batch.email || '';
            userName = user?.display_name || userEmail;
          } else {
            userEmail = batch.email || '';
            userName = userEmail;
          }

          if (!userEmail) {
            throw new Error('No email address found for batch');
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

          if (!workspaceUrl) {
            workspaceUrl = 'https://tuturuuu.com';
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
            if (
              result.blockedRecipients &&
              result.blockedRecipients.length > 0
            ) {
              throw new Error(
                `Email blocked: ${result.blockedRecipients[0]?.reason || 'unknown'}`
              );
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
            status: 'sent',
            channel: 'email',
            email: userEmail,
            notification_count: notifications.length,
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
          status: 'failed',
          channel: batch.channel,
          error: errorMessage,
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
