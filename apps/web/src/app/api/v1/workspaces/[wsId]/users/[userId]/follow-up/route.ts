import { sendWorkspaceEmail } from '@tuturuuu/email-service';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  extractIPFromHeaders,
  isIPBlocked,
} from '@tuturuuu/utils/abuse-protection';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Define Zod schema for request body validation
const followUpEmailSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  content: z.string().min(1, 'Content is required'),
  to_email: z.email('Invalid recipient email format').optional(),
  post_id: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ wsId: string; userId: string }>;
  }
) {
  const { wsId, userId } = await params;
  const permissions = await getPermissions({ wsId });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;

  if (withoutPermission('create_lead_generations')) {
    return NextResponse.json(
      {
        message:
          'User does not have permission to create lead generation emails',
      },
      { status: 403 }
    );
  }

  // Parse and validate request body with Zod
  const parseResult = followUpEmailSchema.safeParse(await req.json());

  if (!parseResult.success) {
    console.log('Invalid request body:', parseResult.error.issues);
    return NextResponse.json(
      {
        message: 'Invalid request body',
        errors: parseResult.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const data = parseResult.data;

  const supabase = await createClient();

  // Get authenticated user
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    console.error('Authentication error:', authError);
    return NextResponse.json(
      { message: 'User not authenticated' },
      { status: 401 }
    );
  }

  // Verify that the user is a workspace user
  const { data: isOrgMember, error: isOrgMemberError } = await supabase.rpc(
    'is_org_member',
    {
      _org_id: wsId,
      _user_id: authUser.id,
    }
  );

  if (isOrgMemberError || !isOrgMember) {
    return NextResponse.json(
      { message: 'User is not a member of the workspace' },
      { status: 404 }
    );
  }

  const sbAdmin = await createAdminClient();

  // Get user information for the receiver
  const { data: receiver, error: receiverError } = await sbAdmin
    .from('workspace_users')
    .select('id, display_name, email')
    .eq('id', userId)
    .single();

  if (receiverError || !receiver) {
    console.error('Error fetching receiver:', receiverError);
    return NextResponse.json(
      { message: 'Receiver not found' },
      { status: 404 }
    );
  }

  const toEmail = data.to_email || receiver.email;
  if (!toEmail) {
    console.log('No recipient email specified');
    return NextResponse.json(
      { message: 'No recipient email specified' },
      { status: 400 }
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

  try {
    let emailSent = false;
    let message = '';
    let messageId: string | undefined;

    let sourceName = 'Tuturuuu';
    let sourceEmail = 'notifications@tuturuuu.com';

    // Use EmailService for all environments
    // In DEV_MODE, emails are logged but NOT sent (handled by EmailService internally)
    const result = await sendWorkspaceEmail(wsId, {
      recipients: { to: [toEmail] },
      content: {
        subject: data.subject,
        html: data.content,
      },
      metadata: {
        wsId,
        userId: authUser.id,
        templateType: 'lead-follow-up',
        entityType: 'lead',
        entityId: userId,
        ipAddress,
      },
    });

    if (result.success) {
      emailSent = true;
      messageId = result.messageId;
      message =
        result.messageId === 'dev-mode-skip'
          ? 'Email logged (DEV_MODE - not actually sent)'
          : 'Email sent successfully';

      // Get credentials for RPC call
      const { data: credentials } = await sbAdmin
        .from('workspace_email_credentials')
        .select('source_name, source_email')
        .eq('ws_id', wsId)
        .single();

      sourceName = credentials?.source_name || 'Tuturuuu';
      sourceEmail = credentials?.source_email || 'notifications@tuturuuu.com';
    } else {
      // Check specific failure reasons
      if (result.rateLimitInfo && !result.rateLimitInfo.allowed) {
        return NextResponse.json(
          {
            message: 'Rate limit exceeded',
            retryAfter: result.rateLimitInfo.retryAfter,
          },
          { status: 429 }
        );
      }

      if (result.blockedRecipients && result.blockedRecipients.length > 0) {
        return NextResponse.json(
          {
            message: 'Email is blacklisted',
            reason: result.blockedRecipients[0]?.reason,
          },
          { status: 400 }
        );
      }

      message = result.error || 'Failed to send email';
      console.error('Email sending failed:', result.error);
    }

    // Create RPC call payload for logging
    const rpcPayload = {
      p_ws_id: wsId,
      p_sender_id: authUser.id,
      p_receiver_id: userId,
      p_source_name: sourceName,
      p_source_email: sourceEmail,
      p_subject: data.subject,
      p_content: data.content,
      p_email: toEmail,
      p_post_id: data.post_id || undefined,
    };

    // Call the RPC function to create the guest lead email record
    const { data: rpcData, error: rpcError } = await sbAdmin.rpc(
      'create_guest_lead_email',
      rpcPayload
    );

    if (rpcError) {
      console.error('Error calling RPC:', rpcError);
      return NextResponse.json(
        { message: 'Failed to create guest lead email record' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message,
        emailSent,
        messageId,
        mail_id: (rpcData as { mail_id?: string })?.mail_id,
        status: emailSent ? 'sent' : 'logged',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in follow-up email:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
