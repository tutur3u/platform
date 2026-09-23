import { render } from '@react-email/render';
import { sendSystemEmail } from '@tuturuuu/email-service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import NotificationDigestEmail from '@tuturuuu/transactional/emails/notification-digest';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { preloadBlockedEmailCache } from '@/lib/email-blacklist';
import {
  getNotificationSkipReason,
  NOTIFICATION_NO_REGISTERED_PUSH_DEVICES_SKIP_REASON,
} from '@/lib/notifications/cron-helpers';
import { beginDeliveryAttempt } from '@/lib/notifications/delivery-attempt';
import {
  cleanupInvalidPushTokens,
  type DeliveryLogWithNotification,
  type EmailTemplateType,
  fetchDeliveryLogsForBatches,
  fetchImmediateEmailConfigs,
  fetchPendingImmediateBatches,
  fetchPushDevicesByUserIds,
  fetchUsersByIds,
  fetchWorkspacesByIds,
  filterRootScopedBatches,
  getPrivateNotificationClient,
  markBatchFailed,
  markBatchSent,
  markDeliveryLogsSent,
  markDeliveryLogsSkipped,
  type NotificationData,
  PROCESSING_DEADLINE_MS,
  RequestBodySchema,
  renderEmailTemplate,
} from '@/lib/notifications/immediate-helpers';
import { getMailPushSkipReason } from '@/lib/notifications/mail-push';
import { sendPushNotificationBatch } from '@/lib/notifications/push-delivery';
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

      let deliveryMayHaveSucceeded = false;
      try {
        const { data: claimed, error: claimError } =
          await getPrivateNotificationClient(sbAdmin)
            .from('notification_batches')
            .update({
              status: 'processing',
              updated_at: new Date().toISOString(),
            })
            .eq('id', batch.id)
            .eq('status', 'pending')
            .select('id');
        if (claimError) throw claimError;
        if (!claimed?.length) continue;

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

          const mailSkipReason = await getMailPushSkipReason(
            sbAdmin,
            logNotification,
            batch
          );
          const skipReason =
            mailSkipReason ??
            (await getNotificationSkipReason(sbAdmin, {
              blockedEmailCache,
              membershipCache,
              notification: logNotification,
            }));

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

          await beginDeliveryAttempt(sbAdmin, batch.id);
          deliveryMayHaveSucceeded = true;
          const pushResult = await sendPushNotificationBatch({
            notification: deliverableLogs[0]!.notifications as NotificationData,
            devices,
          });

          if (pushResult.deliveredCount === 0) {
            deliveryMayHaveSucceeded = false;
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

          await cleanupInvalidPushTokens(sbAdmin, pushResult.invalidTokens);
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
          await beginDeliveryAttempt(sbAdmin, batch.id);
          deliveryMayHaveSucceeded = true;
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
            deliveryMayHaveSucceeded = false;
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

        // The durable marker keeps recovery from replaying an ambiguous send or
        // successful delivery whose acknowledgement could not be persisted.
        if (!deliveryMayHaveSucceeded) {
          await markBatchFailed(sbAdmin, batch.id, errorMessage);
        }

        results.push({
          batch_id: batch.id,
          channel: batch.channel,
          error: errorMessage,
          status: deliveryMayHaveSucceeded
            ? 'reconciliation_required'
            : 'failed',
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
