import { task } from '@trigger.dev/sdk/v3';
import { createAdminClient } from '@tuturuuu/supabase/server';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { render } from '@react-email/components';
import { TaskAssignedEmail } from '@tuturuuu/transactional/emails/task-assigned';
import DOMPurify from 'isomorphic-dompurify';
import juice from 'juice';

interface TaskAssignmentPayload {
  task_id: string;
  assignee_user_id: string;
  assigned_by_user_id: string;
  ws_id: string;
}

const domainBlacklist = ['@easy.com'];

export const sendTaskAssignmentNotification = task({
  id: 'send-task-assignment-notification',
  queue: {
    concurrencyLimit: 10,
  },
  run: async (payload: TaskAssignmentPayload) => {
    console.log('[Task Assignment] Starting notification:', payload);

    try {
      const supabase = await createAdminClient();

      // Fetch task details
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select(
          `
          id,
          name,
          description,
          priority,
          start_date,
          end_date,
          list:task_lists(
            id,
            name,
            board:workspace_boards(
              id,
              name,
              ws_id
            )
          )
        `
        )
        .eq('id', payload.task_id)
        .single();

      if (taskError || !task) {
        console.error('[Task Assignment] Task not found:', taskError);
        return {
          success: false,
          error: 'Task not found',
        };
      }

      // Fetch assignee details
      const { data: assignee, error: assigneeError } = await supabase
        .from('users')
        .select('id, display_name, ...user_private_details(email)')
        .eq('id', payload.assignee_user_id)
        .single();

      if (assigneeError || !assignee) {
        console.error('[Task Assignment] Assignee not found:', assigneeError);
        return {
          success: false,
          error: 'Assignee not found',
        };
      }

      // Check if assignee has email
      if (!assignee.email) {
        console.log('[Task Assignment] Assignee has no email:', payload.assignee_user_id);
        return {
          success: false,
          error: 'Assignee has no email',
        };
      }

      // Check if email is blacklisted
      if (domainBlacklist.some((domain) => assignee.email.includes(domain))) {
        console.log('[Task Assignment] Email domain is blacklisted:', assignee.email);
        return {
          success: false,
          error: 'Email domain is blacklisted',
        };
      }

      // Fetch assigned by user details
      const { data: assignedBy, error: assignedByError } = await supabase
        .from('users')
        .select('id, display_name, ...user_private_details(email)')
        .eq('id', payload.assigned_by_user_id)
        .single();

      if (assignedByError || !assignedBy) {
        console.error('[Task Assignment] Assigned by user not found:', assignedByError);
        return {
          success: false,
          error: 'Assigned by user not found',
        };
      }

      // Fetch workspace details
      const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .select('id, name')
        .eq('id', payload.ws_id)
        .single();

      if (workspaceError || !workspace) {
        console.error('[Task Assignment] Workspace not found:', workspaceError);
        return {
          success: false,
          error: 'Workspace not found',
        };
      }

      // Get workspace email credentials
      const { data: credentials, error: credentialsError } = await supabase
        .from('workspace_email_credentials')
        .select('*')
        .eq('ws_id', payload.ws_id)
        .maybeSingle();

      if (credentialsError) {
        console.error('[Task Assignment] Error fetching credentials:', credentialsError);
        return {
          success: false,
          error: 'Error fetching email credentials',
        };
      }

      if (!credentials) {
        console.log('[Task Assignment] No email credentials configured for workspace');
        return {
          success: false,
          error: 'No email credentials configured',
        };
      }

      // Build task URL
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tuturuuu.com';
      const boardId = task.list?.board?.id;
      const taskUrl = `${baseUrl}/${payload.ws_id}/tasks/boards/${boardId}?task=${task.id}`;

      // Format due date if exists
      const dueDate = task.end_date
        ? new Date(task.end_date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : undefined;

      // Render email template to HTML
      const emailHtml = await render(
        TaskAssignedEmail({
          assigneeName: assignee.display_name,
          assigneeEmail: assignee.email,
          taskName: task.name,
          taskDescription: task.description || undefined,
          assignedByName: assignedBy.display_name,
          assignedByEmail: assignedBy.email || 'noreply@tuturuuu.com',
          taskUrl,
          workspaceName: workspace.name,
          priority: task.priority as 'critical' | 'high' | 'normal' | 'low',
          dueDate,
        })
      );

      // Sanitize and inline CSS
      const sanitizedHtml = DOMPurify.sanitize(emailHtml);
      const inlinedHtml = juice(sanitizedHtml);

      // Create SES client
      const sesClient = new SESClient({
        region: credentials.region,
        credentials: {
          accessKeyId: credentials.access_id,
          secretAccessKey: credentials.access_key,
        },
      });

      // Send email
      const sourceEmail = `${credentials.source_name} <${credentials.source_email}>`;
      const subject = `${assignedBy.display_name} assigned you a task: ${task.name}`;

      const command = new SendEmailCommand({
        Source: sourceEmail,
        Destination: {
          ToAddresses: [assignee.email],
        },
        Message: {
          Subject: { Data: subject },
          Body: {
            Html: { Data: inlinedHtml },
            Text: { Data: `${assignedBy.display_name} assigned you a task: ${task.name}\n\nView task: ${taskUrl}` },
          },
        },
      });

      const sesResponse = await sesClient.send(command);

      if (sesResponse.$metadata.httpStatusCode !== 200) {
        console.error('[Task Assignment] Error sending email:', sesResponse);
        return {
          success: false,
          error: 'Failed to send email',
        };
      }

      console.log('[Task Assignment] Email sent successfully to:', assignee.email);

      // Log sent email to database
      await supabase.from('sent_emails').insert({
        sender_id: payload.assigned_by_user_id,
        receiver_id: payload.assignee_user_id,
        source_name: credentials.source_name,
        source_email: credentials.source_email,
        subject,
        content: inlinedHtml,
      });

      return {
        success: true,
        task_id: task.id,
        assignee_email: assignee.email,
        sent_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[Task Assignment] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});
