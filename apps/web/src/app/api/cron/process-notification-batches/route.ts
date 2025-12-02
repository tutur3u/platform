import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { render } from '@react-email/render';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import NotificationDigestEmail from '@tuturuuu/transactional/emails/notification-digest';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// This API route should be called by a cron job (pg_cron, Trigger.dev, or external cron service)
// It processes BATCHED notification batches and sends email digests
// Immediate notifications are handled by /api/notifications/send-immediate

// Feature flag: When true, only send emails for notifications belonging to the root workspace
// Set to false to allow emails for all workspaces
const RESTRICT_TO_ROOT_WORKSPACE_ONLY = true;

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  description: string;
  data: Record<string, any>;
  createdAt: string;
}

export async function POST(req: NextRequest) {
  try {
    // Verify the request is authorized (check for cron secret)
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sbAdmin = await createAdminClient();

    // Get AWS SES credentials from workspace_email_credentials
    const { data: credentials, error: credentialsError } = await sbAdmin
      .from('workspace_email_credentials')
      .select('*')
      .eq('ws_id', ROOT_WORKSPACE_ID)
      .maybeSingle();

    if (credentialsError || !credentials) {
      console.error('Error fetching SES credentials:', credentialsError);
      return NextResponse.json(
        {
          error: 'Email credentials not configured',
          processed: 0,
          failed: 0,
        },
        { status: 500 }
      );
    }

    // Create SES client
    const sesClient = new SESClient({
      region: credentials.region,
      credentials: {
        accessKeyId: credentials.access_id,
        secretAccessKey: credentials.access_key,
      },
    });

    // Get all pending BATCHED notifications where window_end has passed
    // Immediate notifications are handled separately by /api/notifications/send-immediate
    const { data: batches, error: batchesError } = await sbAdmin
      .from('notification_batches')
      .select('*')
      .eq('status', 'pending')
      .eq('delivery_mode', 'batched')
      .lte('window_end', new Date().toISOString())
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
            notifications (
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
                validBatchIdsFromNullWsId.push(log.batch_id);
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
      email?: string;
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
            notifications (
              id,
              type,
              title,
              description,
              data,
              created_at
            )
          `
          )
          .eq('batch_id', batch.id)
          .eq('status', 'pending')
          .eq('channel', 'email')
          .order('notifications(created_at)', { ascending: false });

        if (logsError || !deliveryLogs || deliveryLogs.length === 0) {
          // No notifications to send, mark batch as sent
          await sbAdmin
            .from('notification_batches')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', batch.id);

          results.push({
            batch_id: batch.id,
            status: 'skipped',
            reason: 'no_notifications',
          });
          processedCount++;
          continue;
        }

        // Get user details (either by user_id or email)
        let userEmail: string;
        let userName: string;

        if (batch.user_id) {
          const { data: user } = await sbAdmin
            .from('users')
            .select('email:user_private_details(email), display_name')
            .eq('id', batch.user_id)
            .single();

          const emailData = user?.email as unknown as Array<{ email: string }>;
          userEmail = emailData?.[0]?.email || batch.email || '';
          userName = user?.display_name || userEmail;
        } else {
          // Email-only (pending user)
          userEmail = batch.email || '';
          userName = userEmail;
        }

        if (!userEmail) {
          throw new Error('No email address found for batch');
        }

        // Get workspace details (if workspace-scoped)
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

        // Format notifications for email template
        const notifications: NotificationItem[] = deliveryLogs
          .map((log: any) => log.notifications)
          .filter(Boolean)
          .map((n: any) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            description: n.description,
            data: n.data,
            createdAt: n.created_at,
          }));

        // Render digest email template
        const emailHtml = await render(
          NotificationDigestEmail({
            userName,
            workspaceName,
            notifications,
            workspaceUrl,
          })
        );

        const emailSubject = `${notifications.length} new notification${notifications.length !== 1 ? 's' : ''} from ${workspaceName}`;

        // Send email via SES
        const sourceEmail =
          credentials.source_email || 'notifications@tuturuuu.com';
        const command = new SendEmailCommand({
          Source: sourceEmail,
          Destination: {
            ToAddresses: [userEmail],
          },
          Message: {
            Subject: {
              Data: emailSubject,
            },
            Body: {
              Html: { Data: emailHtml },
            },
          },
        });

        const sesResponse = await sesClient.send(command);

        if (sesResponse.$metadata.httpStatusCode !== 200) {
          throw new Error(
            `SES returned status ${sesResponse.$metadata.httpStatusCode}`
          );
        }

        // Mark all delivery logs as sent
        await sbAdmin
          .from('notification_delivery_log')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('batch_id', batch.id)
          .eq('status', 'pending');

        // Mark batch as sent
        await sbAdmin
          .from('notification_batches')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            notification_count: notifications.length,
            updated_at: new Date().toISOString(),
          })
          .eq('id', batch.id);

        results.push({
          batch_id: batch.id,
          status: 'sent',
          email: userEmail,
          notification_count: notifications.length,
        });
        processedCount++;
      } catch (error) {
        console.error(`Error processing batch ${batch.id}:`, error);

        // Mark batch as failed
        await sbAdmin
          .from('notification_batches')
          .update({
            status: 'failed',
            error_message:
              error instanceof Error ? error.message : 'Unknown error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', batch.id);

        // Mark delivery logs as failed and increment retry_count
        // Note: Supabase doesn't support .raw() - we'll increment in a separate query
        const { data: failedLogs } = await sbAdmin
          .from('notification_delivery_log')
          .select('id, retry_count')
          .eq('batch_id', batch.id)
          .eq('status', 'pending');

        if (failedLogs) {
          for (const log of failedLogs) {
            await sbAdmin
              .from('notification_delivery_log')
              .update({
                status: 'failed',
                error_message:
                  error instanceof Error ? error.message : 'Unknown error',
                retry_count: (log.retry_count || 0) + 1,
                updated_at: new Date().toISOString(),
              })
              .eq('id', log.id);
          }
        }

        results.push({
          batch_id: batch.id,
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

// Allow GET for health checks
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message:
      'Notification batch processor endpoint (batched notifications only)',
  });
}
