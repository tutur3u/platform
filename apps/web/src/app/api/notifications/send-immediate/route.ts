import { render } from '@react-email/render';
import { sendSystemEmail } from '@tuturuuu/email-service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import DeadlineReminderEmail from '@tuturuuu/transactional/emails/deadline-reminder';
import NotificationDigestEmail, {
  generateSubjectLine,
  type NotificationItem,
} from '@tuturuuu/transactional/emails/notification-digest';
import WorkspaceInviteEmail from '@tuturuuu/transactional/emails/workspace-invite';
import { MAX_NAME_LENGTH, ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getQueuedNotificationActionUrl,
  getQueuedNotificationTaskId,
  planQueuedNotifications,
  type QueuedNotification,
  type TaskStateSnapshot,
} from '@/app/api/notifications/delivery-utils';

// Feature flag: When true, only send emails for notifications belonging to the root workspace
// Set to false to allow emails for all workspaces
const RESTRICT_TO_ROOT_WORKSPACE_ONLY = true;

// Zod schema for request body validation
const RequestBodySchema = z.object({
  batch_id: z.string().max(MAX_NAME_LENGTH).optional(),
  batch_ids: z.array(z.string()).optional(),
});

// Email template registry for immediate notifications
type EmailTemplateType =
  | 'workspace-invite'
  | 'deadline-reminder'
  | 'notification-digest';

interface NotificationData {
  id: string;
  type: string;
  code?: string;
  title: string;
  description: string;
  data: Record<string, any>;
  created_at: string;
}

interface RenderTemplateParams {
  templateType: EmailTemplateType;
  notification: NotificationData;
  userName: string;
  workspaceName?: string;
}

// Pre-fetched data types for batch processing
interface UserData {
  id: string;
  display_name: string | null;
  email: string | null;
}

interface WorkspaceData {
  id: string;
  name: string | null;
}

interface EmailConfigData {
  notification_type: string;
  email_template: string | null;
  email_subject_template: string | null;
}

interface DeliveryLogWithNotification {
  id: string;
  batch_id: string;
  notification_id: string;
  notifications: NotificationData | null;
}

async function fetchTaskStateMap(
  sbAdmin: any,
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

async function markSkippedDeliveryLogs(
  sbAdmin: any,
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

// Render the appropriate email template based on type
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

/**
 * This endpoint processes immediate notification batches right away.
 * It should be called via a database trigger (pg_net) or webhook when
 * an immediate notification batch is created.
 *
 * The endpoint can be triggered:
 * 1. Via pg_net HTTP extension from a database trigger
 * 2. Via Supabase Edge Function webhook
 * 3. Via direct API call from application code
 */
export async function POST(req: NextRequest) {
  try {
    // Verify the request is authorized
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

    // Accept either CRON_SECRET or service role key for authorization
    const isAuthorized =
      (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
      (supabaseServiceKey && authHeader === `Bearer ${supabaseServiceKey}`);

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body to get batch_id (optional - if not provided, process all pending immediate batches)
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
    // If no body provided, batchIds remains empty and we process all pending immediate batches

    const sbAdmin = await createAdminClient();

    // Build query for immediate batches
    let query = sbAdmin
      .from('notification_batches')
      .select('*')
      .eq('status', 'pending')
      .eq('delivery_mode', 'immediate');

    // If specific batch IDs provided, filter by them
    if (batchIds.length > 0) {
      query = query.in('id', batchIds);
    }

    const { data: batches, error: batchesError } = await query.limit(20);

    if (batchesError) {
      console.error('Error fetching immediate batches:', batchesError);
      return NextResponse.json(
        { error: 'Error fetching batches' },
        { status: 500 }
      );
    }

    if (!batches || batches.length === 0) {
      return NextResponse.json({
        message: 'No immediate batches to process',
        processed: 0,
      });
    }

    // If restricted to root workspace, we need to filter batches after fetching
    // because ws_id can be null for user-scoped notifications (like workspace invites)
    // In that case, the workspace ID is stored in the notification's entity_id or data
    let filteredBatches = batches;

    if (RESTRICT_TO_ROOT_WORKSPACE_ONLY) {
      // First, get the notification data for batches with null ws_id to check entity_id
      const batchesWithNullWsId = batches.filter((b) => b.ws_id === null);
      const batchesWithWsId = batches.filter((b) => b.ws_id !== null);

      // Keep batches that have ws_id = ROOT_WORKSPACE_ID
      const validBatchesWithWsId = batchesWithWsId.filter(
        (b) => b.ws_id === ROOT_WORKSPACE_ID
      );

      // For batches with null ws_id, check the notification's entity_id or data->workspace_id
      const validBatchIdsFromNullWsId: string[] = [];

      if (batchesWithNullWsId.length > 0) {
        const batchIdsToCheck = batchesWithNullWsId.map((b) => b.id);

        // Get notifications for these batches to check their entity_id/data
        const { data: deliveryLogsForCheck } = await sbAdmin
          .from('notification_delivery_log')
          .select(
            `
            batch_id,
            notifications:notifications!notification_delivery_log_notification_id_fkey (
              entity_id,
              data
            )
          `
          )
          .in('batch_id', batchIdsToCheck)
          .eq('channel', 'email');

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
                validBatchIdsFromNullWsId.push(log.batch_id as string);
              }
            }
          }
        }
      }

      // Combine valid batches
      const validBatchIds = new Set([
        ...validBatchesWithWsId.map((b) => b.id),
        ...validBatchIdsFromNullWsId,
      ]);

      filteredBatches = batches.filter((b) => validBatchIds.has(b.id));

      if (filteredBatches.length === 0) {
        return NextResponse.json({
          message:
            'No immediate batches to process (filtered by root workspace)',
          processed: 0,
        });
      }
    }

    // ========================================================================
    // BATCH PRE-FETCH: Reduce N+1 queries by fetching all related data upfront
    // With 20 batches limit, this reduces from 60+ queries to ~5 queries
    // ========================================================================

    const batchIdList = filteredBatches.map((b) => b.id);

    // 1. Pre-fetch all delivery logs with notifications for all batches (1 query)
    const { data: allDeliveryLogs } = await sbAdmin
      .from('notification_delivery_log')
      .select(
        `
        id,
        batch_id,
        notification_id,
        notifications:notifications!notification_delivery_log_notification_id_fkey (
          id,
          type,
          code,
          title,
          description,
          data,
          created_at
        )
      `
      )
      .in('batch_id', batchIdList)
      .eq('status', 'pending')
      .eq('channel', 'email');

    // Group delivery logs by batch_id for O(1) lookup
    const deliveryLogsByBatch = new Map<
      string,
      DeliveryLogWithNotification[]
    >();
    for (const log of (allDeliveryLogs ||
      []) as DeliveryLogWithNotification[]) {
      const existing = deliveryLogsByBatch.get(log.batch_id) || [];
      existing.push(log);
      deliveryLogsByBatch.set(log.batch_id, existing);
    }

    // 2. Pre-fetch all unique users with their email details (1 query)
    const uniqueUserIds = [
      ...new Set(filteredBatches.map((b) => b.user_id).filter(Boolean)),
    ] as string[];

    const usersMap = new Map<string, UserData>();
    if (uniqueUserIds.length > 0) {
      const { data: users } = await sbAdmin
        .from('users')
        .select('id, display_name, email:user_private_details(email)')
        .in('id', uniqueUserIds);

      for (const user of users || []) {
        const emailData = user.email as unknown as Array<{ email: string }>;
        usersMap.set(user.id, {
          id: user.id,
          display_name: user.display_name,
          email: emailData?.[0]?.email || null,
        });
      }
    }

    // 3. Pre-fetch all unique workspaces (1 query)
    const uniqueWsIds = [
      ...new Set(filteredBatches.map((b) => b.ws_id).filter(Boolean)),
    ] as string[];

    const workspacesMap = new Map<string, WorkspaceData>();
    if (uniqueWsIds.length > 0) {
      const { data: workspaces } = await sbAdmin
        .from('workspaces')
        .select('id, name')
        .in('id', uniqueWsIds);

      for (const ws of workspaces || []) {
        workspacesMap.set(ws.id, { id: ws.id, name: ws.name });
      }
    }

    // 4. Pre-fetch all notification types from delivery logs to get email configs (1 query)
    const notificationTypes = new Set<string>();
    for (const logs of deliveryLogsByBatch.values()) {
      for (const log of logs) {
        const notification = log.notifications;
        if (notification) {
          const notifType = notification.type || notification.code || '';
          if (notifType) notificationTypes.add(notifType);
        }
      }
    }

    const emailConfigsMap = new Map<string, EmailConfigData>();
    if (notificationTypes.size > 0) {
      const { data: emailConfigs } = await sbAdmin
        .from('notification_email_config')
        .select('notification_type, email_template, email_subject_template')
        .in('notification_type', [...notificationTypes])
        .eq('delivery_mode', 'immediate')
        .eq('enabled', true);

      for (const config of emailConfigs || []) {
        emailConfigsMap.set(config.notification_type, config);
      }
    }

    // ========================================================================
    // PROCESS BATCHES: Now using pre-fetched data (O(1) lookups)
    // ========================================================================

    let processedCount = 0;
    let failedCount = 0;
    const results: Array<{
      batch_id: string;
      status: string;
      email?: string;
      error?: string;
    }> = [];

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
          .eq('status', 'pending');

        // Get delivery logs from pre-fetched data (O(1) lookup)
        const deliveryLogs = deliveryLogsByBatch.get(batch.id);

        if (!deliveryLogs || deliveryLogs.length === 0) {
          await sbAdmin
            .from('notification_batches')
            .update({
              status: 'skipped',
              skip_reason: 'no_notifications',
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as never)
            .eq('id', batch.id);

          results.push({
            batch_id: batch.id,
            status: 'skipped',
          });
          processedCount++;
          continue;
        }

        // Get user details from pre-fetched data (O(1) lookup)
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

        if (!userEmail) {
          throw new Error('No email address found for batch');
        }

        // Get workspace details from pre-fetched data (O(1) lookup)
        let workspaceName = 'Tuturuuu';
        if (batch.ws_id) {
          const workspace = workspacesMap.get(batch.ws_id);
          if (workspace) {
            workspaceName = workspace.name || 'Unknown Workspace';
          }
        }

        const queuedNotifications: QueuedNotification[] = [];
        for (const deliveryLog of deliveryLogs) {
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
            description: notification.description ?? null,
            data: notification.data,
            createdAt: notification.created_at,
            entityId: null,
            entityType: null,
            actionUrl:
              (notification.data?.action_url as string | undefined) || null,
          });
        }

        const taskStateMap = await fetchTaskStateMap(
          sbAdmin,
          queuedNotifications
        );
        const plan = planQueuedNotifications(queuedNotifications, taskStateMap);

        const staleSkipped = plan.skipped.filter(
          (entry) => entry.reason !== 'consolidated_to_latest'
        );
        const consolidatedSkipped = plan.skipped.filter(
          (entry) => entry.reason === 'consolidated_to_latest'
        );

        await markSkippedDeliveryLogs(sbAdmin, staleSkipped);

        if (plan.notificationsToSend.length === 0) {
          await sbAdmin
            .from('notification_batches')
            .update({
              status: 'skipped',
              skip_reason: staleSkipped[0]?.reason || 'task_inactive',
              updated_at: new Date().toISOString(),
            } as never)
            .eq('id', batch.id);

          results.push({
            batch_id: batch.id,
            status: 'skipped',
            email: userEmail,
          });
          processedCount++;
          continue;
        }

        const notification = plan.notificationsToSend[0]!;
        const primaryNotification = deliveryLogs.find(
          (deliveryLog) =>
            deliveryLog.notification_id === notification.notificationId
        )?.notifications as NotificationData | undefined;

        if (!primaryNotification) {
          throw new Error('No notification found in delivery log');
        }

        // Get email config from pre-fetched data (O(1) lookup)
        const notifType =
          primaryNotification.type || primaryNotification.code || '';
        const config = emailConfigsMap.get(notifType);

        let emailHtml: string;
        let emailSubject: string;

        if (config?.email_template && plan.notificationsToSend.length === 1) {
          const templateResult = await renderEmailTemplate({
            templateType: config.email_template as EmailTemplateType,
            notification: primaryNotification,
            userName,
            workspaceName,
          });
          emailHtml = templateResult.html;
          emailSubject = templateResult.subject;
        } else {
          const digestNotifications: NotificationItem[] =
            plan.notificationsToSend.map((item) => ({
              id: item.notificationId,
              type: item.type,
              title: item.title,
              description: item.description || '',
              data: item.data || {},
              createdAt: item.createdAt,
              actionUrl: getQueuedNotificationActionUrl(item),
              isConsolidated: item.isConsolidated,
              consolidatedCount: item.consolidatedCount,
              changeTypes: item.changeTypes,
            }));

          // Fallback to digest template
          emailHtml = await render(
            NotificationDigestEmail({
              userName,
              workspaceName,
              notifications: digestNotifications,
              workspaceUrl:
                process.env.NEXT_PUBLIC_APP_URL || 'https://tuturuuu.com',
            })
          );
          emailSubject = generateSubjectLine(
            digestNotifications,
            workspaceName
          );
        }

        // Send email via centralized EmailService (bypasses rate limiting for system emails)
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
            entityId: primaryNotification.id,
          },
        });

        if (!result.success) {
          // Check for blocked recipients
          if (result.blockedRecipients && result.blockedRecipients.length > 0) {
            throw new Error(
              `Email blocked: ${result.blockedRecipients[0]?.reason || 'unknown'}`
            );
          }
          throw new Error(result.error || 'Failed to send email');
        }

        // Mark as sent
        await sbAdmin
          .from('notification_delivery_log')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as never)
          .in(
            'id',
            plan.notificationsToSend.map((item) => item.deliveryLogId)
          )
          .eq('status', 'pending');

        await markSkippedDeliveryLogs(sbAdmin, consolidatedSkipped);

        await sbAdmin
          .from('notification_batches')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            notification_count: plan.notificationsToSend.length,
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', batch.id);

        results.push({
          batch_id: batch.id,
          status: 'sent',
          email: userEmail,
        });
        processedCount++;
      } catch (error) {
        console.error(`Error processing immediate batch ${batch.id}:`, error);

        await sbAdmin
          .from('notification_batches')
          .update({
            status: 'failed',
            error_message:
              error instanceof Error ? error.message : 'Unknown error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', batch.id);

        results.push({
          batch_id: batch.id,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
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
