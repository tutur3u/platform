import { render } from '@react-email/render';
import { EmailService } from '@tuturuuu/email-service';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { UserGroupPost } from '@tuturuuu/types/db';
import {
  extractIPFromHeaders,
  isIPBlocked,
} from '@tuturuuu/utils/abuse-protection';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import dayjs from 'dayjs';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import PostEmailTemplate from '@/app/[locale]/(dashboard)/[wsId]/mail/default-email-template';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

interface UserToEmail {
  id: string;
  email: string;
  username: string;
  notes: string;
  is_completed: boolean;
}

const EmailUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  username: z.string().min(1),
  notes: z.string(),
  is_completed: z.boolean(),
});

const EmailPostSchema = z.object({
  title: z.string().nullable(),
  content: z.string().nullable(),
  notes: z.string().nullable(),
  id: z.string().optional(),
  ws_id: z.string().optional(),
  name: z.string().optional(),
  created_at: z.string().optional(),
  group_id: z.string().optional(),
  group_name: z.string().optional(),
  post_approval_status: z.enum(['APPROVED', 'PENDING', 'REJECTED']).optional(),
});

const EmailRequestSchema = z.object({
  users: z.array(EmailUserSchema).min(1),
  post: EmailPostSchema,
  date: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid date format',
  }),
});

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ wsId: string; groupId: string; postId: string }>;
  }
) {
  try {
    const sbAdmin = await createAdminClient();
    const supabase = await createClient();
    const { wsId, groupId, postId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);

    console.log(
      `[POST /api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}/email] Request received`
    );

    const permissions = await getPermissions({
      wsId,
    });
if (!permissions) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
const { withoutPermission } = permissions;

    if (withoutPermission('send_user_group_post_emails')) {
      console.log(
        `[POST /api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}/email] Permission denied`
      );
      return NextResponse.json(
        { message: 'Permission denied' },
        { status: 403 }
      );
    }

    // Check if post is approved before allowing email send
    // Fetch post from database to verify approval status (don't trust client input)
    const { data: post, error: postError } = await sbAdmin
      .from('user_group_posts')
      .select('id, post_approval_status, workspace_user_groups!inner(ws_id)')
      .eq('id', postId)
      .eq('group_id', groupId)
      .eq('workspace_user_groups.ws_id', normalizedWsId)
      .single();

    if (postError || !post) {
      console.log(
        `[POST /api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}/email] Post not found`
      );
      return NextResponse.json({ message: 'Post not found' }, { status: 404 });
    }

    if (post.post_approval_status !== 'APPROVED') {
      console.log(
        `[POST /api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}/email] Post not approved`
      );
      return NextResponse.json(
        { message: 'Post must be approved before sending emails' },
        { status: 403 }
      );
    }

    const parsedBody = EmailRequestSchema.safeParse(await req.json());

    if (!parsedBody.success) {
      console.log(
        `[POST /api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}/email] Invalid request body`
      );
      return NextResponse.json(
        {
          message: 'Invalid request body',
          errors: parsedBody.error.flatten(),
        },
        { status: 400 }
      );
    }

    const data = parsedBody.data as {
      users: UserToEmail[];
      post: UserGroupPost & { group_name?: string };
      date: string;
    };

    // Check if workspace has email sending enabled
    const { data: workspaceSecret } =
      normalizedWsId === process.env.MAILBOX_ALLOWED_WS_ID
        ? { data: { id: normalizedWsId, value: 'true' } }
        : await sbAdmin
            .from('workspace_secrets')
            .select('*')
            .eq('ws_id', normalizedWsId)
            .eq('name', 'ENABLE_EMAIL_SENDING')
            .maybeSingle();

    const isWSIDAllowed = workspaceSecret?.value === 'true';

    if (!isWSIDAllowed) {
      console.log(
        `[POST /api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}/email] Workspace ID is not allowed`
      );
      return NextResponse.json(
        { message: 'Workspace ID is not allowed' },
        { status: 403 }
      );
    }

    console.log(
      `[POST /api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}/email] Processing ${data.users.length} users`
    );

    // Get authenticated user
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json(
        { message: 'User not authenticated' },
        { status: 401 }
      );
    }

    // Get client IP for rate limiting
    const ipAddress = extractIPFromHeaders(req.headers);

    if (ipAddress !== 'unknown') {
      const blockInfo = await isIPBlocked(ipAddress);
      if (blockInfo) {
        const retryAfter = Math.max(
          1,
          Math.ceil((blockInfo.expiresAt.getTime() - Date.now()) / 1000)
        );

        return NextResponse.json(
          { message: 'Rate limit exceeded', retryAfter },
          {
            status: 429,
            headers: {
              'Retry-After': `${retryAfter}`,
            },
          }
        );
      }
    }

    // Create EmailService instance for this workspace
    let emailService: EmailService;
    let sourceName = 'Tuturuuu';
    let sourceEmail = 'notifications@tuturuuu.com';

    try {
      emailService = await EmailService.fromWorkspace(normalizedWsId, {
        rateLimits: isWSIDAllowed
          ? {
              workspacePerMinute: 100, // Increased limit for allowed workspaces
              workspacePerHour: 5000,
              userPerMinute: 100, // Match workspace limit to avoid bottleneck
              userPerHour: 5000,
            }
          : undefined,
      });

      // Get source info from credentials for backwards compatibility logging
      const { data: credentials } = await sbAdmin
        .from('workspace_email_credentials')
        .select('source_name, source_email')
        .eq('ws_id', normalizedWsId)
        .single();

      if (credentials) {
        sourceName = credentials.source_name || sourceName;
        sourceEmail = credentials.source_email || sourceEmail;
      }
    } catch (error) {
      console.error(
        `[POST /api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}/email] Error creating EmailService:`,
        error
      );
      return NextResponse.json(
        { message: 'Email credentials not configured' },
        { status: 500 }
      );
    }

    console.log(
      `[POST /api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}/email] Sending ${data.users.length} emails`
    );

    // Process emails - send one per user
    const results = await Promise.all(
      data.users.map(async (user) => {
        // Check if email was already sent for this post/user combination
        const { data: existingSentEmail } = await supabase
          .from('sent_emails')
          .select('id')
          .eq('receiver_id', user.id)
          .eq('post_id', postId)
          .limit(1)
          .maybeSingle();

        if (existingSentEmail) {
          return { success: false, reason: 'already_sent', user };
        }

        const subject = `Easy Center | Báo cáo tiến độ ngày ${dayjs(data.date).format('DD/MM/YYYY')} của ${user.username}`;

        // Render email template server-side
        const htmlContent = await render(
          PostEmailTemplate({
            post: data.post,
            groupName: data.post.group_name,
            username: user.username,
            isHomeworkDone: user.is_completed,
            notes: user.notes || undefined,
          })
        );

        // Send via EmailService with full protection
        // DEV_MODE is handled internally by EmailService - emails are logged but not sent
        const result = await emailService.send({
          recipients: { to: [user.email] },
          content: { subject, html: htmlContent },
          metadata: {
            wsId: normalizedWsId,
            userId: authUser.id,
            templateType: 'user-group-post',
            entityType: 'post',
            entityId: postId,
            ipAddress,
          },
        });

        if (result.success) {
          // Log sent email to sent_emails table for backwards compatibility
          const { data: sentEmail, error: insertError } = await supabase
            .from('sent_emails')
            .insert({
              post_id: postId,
              ws_id: normalizedWsId,
              sender_id: authUser.id,
              receiver_id: user.id,
              email: user.email,
              subject,
              content: htmlContent,
              source_name: sourceName,
              source_email: sourceEmail,
            })
            .select('id')
            .single();

          if (insertError) {
            console.error('[sendEmail] Error logging sent email', {
              email: user.email,
              error: insertError,
            });
          } else if (sentEmail) {
            // Update user_group_post_checks with the email_id
            await supabase
              .from('user_group_post_checks')
              .update({ email_id: sentEmail.id })
              .eq('post_id', postId)
              .eq('user_id', user.id);
          }

          return { success: true, user, messageId: result.messageId };
        } else {
          // Check if blocked by blacklist or rate limit
          if (result.blockedRecipients && result.blockedRecipients.length > 0) {
            return {
              success: false,
              reason: 'blocked',
              blockedReason: result.blockedRecipients[0]?.reason,
              user,
            };
          }
          if (result.rateLimitInfo && !result.rateLimitInfo.allowed) {
            return {
              success: false,
              reason: 'rate_limited',
              user,
              rateLimitInfo: result.rateLimitInfo,
            };
          }
          return {
            success: false,
            reason: 'send_failed',
            error: result.error,
            user,
          };
        }
      })
    );

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter(
      (r) => !r.success && r.reason !== 'already_sent'
    ).length;
    const blockedCount = results.filter((r) => r.reason === 'blocked').length;
    const alreadySentCount = results.filter(
      (r) => r.reason === 'already_sent'
    ).length;

    const rateLimitError = results.find((r) => r.reason === 'rate_limited') as
      | { rateLimitInfo?: any }
      | undefined;

    console.log(
      `[POST /api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}/email] Results - Success: ${successCount}, Failures: ${failureCount}, Blocked: ${blockedCount}, Already Sent: ${alreadySentCount}`
    );

    return NextResponse.json(
      {
        message: 'Emails processed',
        successCount,
        failureCount,
        blockedCount,
        alreadySentCount,
        rateLimitInfo: rateLimitError?.rateLimitInfo,
      },
      {
        status:
          failureCount === 0
            ? 200 // All succeeded
            : successCount > 0
              ? 207 // Mixed success and failure
              : 500, // All failed
      }
    );
  } catch (error) {
    console.error(
      `[POST /api/v1/workspaces/.../user-groups/.../group-checks/.../email] Unhandled error:`,
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      {
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
