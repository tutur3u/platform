import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { render } from '@react-email/render';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import NotificationDigestEmail from '@tuturuuu/transactional/emails/notification-digest';
import WorkspaceInviteEmail from '@tuturuuu/transactional/emails/workspace-invite';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Email template registry for immediate notifications
type EmailTemplateType = 'workspace-invite' | 'notification-digest';

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
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Accept either CRON_SECRET or service role key for authorization
    const isAuthorized =
      (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
      (supabaseServiceKey && authHeader === `Bearer ${supabaseServiceKey}`);

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body to get batch_id (optional - if not provided, process all pending immediate batches)
    let batchIds: string[] = [];
    try {
      const body = await req.json();
      if (body.batch_id) {
        batchIds = [body.batch_id];
      } else if (body.batch_ids && Array.isArray(body.batch_ids)) {
        batchIds = body.batch_ids;
      }
    } catch {
      // No body provided, will process all pending immediate batches
    }

    const sbAdmin = await createAdminClient();

    // Get AWS SES credentials
    const { data: credentials, error: credentialsError } = await sbAdmin
      .from('workspace_email_credentials')
      .select('*')
      .eq('ws_id', ROOT_WORKSPACE_ID)
      .maybeSingle();

    if (credentialsError || !credentials) {
      console.error('Error fetching SES credentials:', credentialsError);
      return NextResponse.json(
        { error: 'Email credentials not configured' },
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

    let processedCount = 0;
    let failedCount = 0;
    const results: Array<{
      batch_id: string;
      status: string;
      email?: string;
      error?: string;
    }> = [];

    for (const batch of batches) {
      try {
        // Mark batch as processing
        await sbAdmin
          .from('notification_batches')
          .update({ status: 'processing', updated_at: new Date().toISOString() })
          .eq('id', batch.id)
          .eq('status', 'pending');

        // Get notification for this batch
        const { data: deliveryLogs, error: logsError } = await sbAdmin
          .from('notification_delivery_log')
          .select(
            `
            notification_id,
            notifications (
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
          .eq('batch_id', batch.id)
          .eq('status', 'pending')
          .eq('channel', 'email');

        if (logsError || !deliveryLogs || deliveryLogs.length === 0) {
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
          });
          processedCount++;
          continue;
        }

        // Get user details
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
          userEmail = batch.email || '';
          userName = userEmail;
        }

        if (!userEmail) {
          throw new Error('No email address found for batch');
        }

        // Get workspace details
        let workspaceName = 'Tuturuuu';
        if (batch.ws_id) {
          const { data: workspace } = await sbAdmin
            .from('workspaces')
            .select('name')
            .eq('id', batch.ws_id)
            .single();

          if (workspace) {
            workspaceName = workspace.name || 'Unknown Workspace';
          }
        }

        // Get the notification
        const notification = (deliveryLogs[0])?.notifications as NotificationData;
        if (!notification) {
          throw new Error('No notification found in delivery log');
        }

        // Get email config for this notification type
        // Note: notification_email_config table is created via migration
        const { data: emailConfig } = await sbAdmin
          .from('notification_email_config')
          .select('email_template, email_subject_template')
          .eq('notification_type', notification.type || notification.code || '')
          .eq('delivery_mode', 'immediate')
          .eq('enabled', true)
          .maybeSingle();

        let emailHtml: string;
        let emailSubject: string;

        const config = emailConfig as { email_template?: string; email_subject_template?: string } | null;
        if (config?.email_template) {
          const templateResult = await renderEmailTemplate({
            templateType: config.email_template as EmailTemplateType,
            notification,
            userName,
            workspaceName,
          });
          emailHtml = templateResult.html;
          emailSubject = templateResult.subject;
        } else {
          // Fallback to digest template
          emailHtml = await render(
            NotificationDigestEmail({
              userName,
              workspaceName,
              notifications: [
                {
                  id: notification.id,
                  type: notification.type,
                  title: notification.title,
                  description: notification.description,
                  data: notification.data,
                  createdAt: notification.created_at,
                },
              ],
              workspaceUrl:
                process.env.NEXT_PUBLIC_APP_URL || 'https://tuturuuu.com',
            })
          );
          emailSubject = `New notification from ${workspaceName}`;
        }

        // Send email
        const sourceEmail =
          credentials.source_email || 'notifications@tuturuuu.com';
        const command = new SendEmailCommand({
          Source: sourceEmail,
          Destination: { ToAddresses: [userEmail] },
          Message: {
            Subject: { Data: emailSubject },
            Body: { Html: { Data: emailHtml } },
          },
        });

        const sesResponse = await sesClient.send(command);

        if (sesResponse.$metadata.httpStatusCode !== 200) {
          throw new Error(
            `SES returned status ${sesResponse.$metadata.httpStatusCode}`
          );
        }

        // Mark as sent
        await sbAdmin
          .from('notification_delivery_log')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('batch_id', batch.id)
          .eq('status', 'pending');

        await sbAdmin
          .from('notification_batches')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            notification_count: deliveryLogs.length,
            updated_at: new Date().toISOString(),
          })
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
