import { DEV_MODE } from '@/constants/common';
import { sendWorkspaceEmail } from '@tuturuuu/email-service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import DOMPurify from 'isomorphic-dompurify';
import { difference } from 'lodash';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ wsId: string }>;
  }
) {
  const { wsId } = await params;

  const data: {
    mail?: {
      to?: string[];
      cc?: string[];
      bcc?: string[];
      subject?: string;
      content?: string;
    };
    config?: {
      accessKeyId?: string;
      accessKeySecret?: string;
    };
  } = await req.json();

  if (!data?.mail?.to || !data?.mail?.subject || !data?.mail?.content) {
    console.log('Invalid request body');
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  if (
    data.mail.to.length === 0 &&
    data.mail.cc?.length === 0 &&
    data.mail.bcc?.length === 0
  ) {
    console.log('No recipients specified');
    return NextResponse.json(
      { message: 'No recipients specified' },
      { status: 400 }
    );
  }

  if (!data.config?.accessKeyId || !data.config?.accessKeySecret) {
    console.log('Missing email configuration');
    return NextResponse.json(
      { message: 'Missing email configuration' },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();

  // Get client IP for rate limiting
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  const { data: apiKey, error: apiKeyError } = await sbAdmin
    .from('internal_email_api_keys')
    .select(
      'user:users!user_id(id, display_name, ...user_private_details(email)), allowed_emails'
    )
    .eq('id', data.config.accessKeyId)
    .eq('value', data.config.accessKeySecret)
    .single();

  if (apiKeyError) {
    console.error('Error fetching API key:', apiKeyError);
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!apiKey) {
    console.error('Invalid API key');
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const userEmail = apiKey?.user?.email;
  if (!userEmail || !isValidTuturuuuEmail(userEmail)) {
    console.error('User is not using a valid Tuturuuu email');
    return NextResponse.json(
      { message: 'Only Tuturuuu emails are allowed' },
      { status: 401 }
    );
  }

  if (
    apiKey.allowed_emails &&
    difference(
      [...data.mail.to, ...(data.mail.cc || []), ...(data.mail.bcc || [])],
      apiKey.allowed_emails
    ).length > 0
  ) {
    console.error(
      'Email not allowed',
      { to: data.mail.to, cc: data.mail.cc, bcc: data.mail.bcc },
      apiKey.allowed_emails,
      difference(
        [...data.mail.to, ...(data.mail.cc || []), ...(data.mail.bcc || [])],
        apiKey.allowed_emails
      )
    );
    return NextResponse.json({ message: 'Email not allowed' }, { status: 400 });
  }

  try {
    // Send email using centralized EmailService with rate limiting and blacklist checks
    const result = await sendWorkspaceEmail(ROOT_WORKSPACE_ID, {
      recipients: {
        to: data.mail.to,
        cc: data.mail.cc,
        bcc: data.mail.bcc,
      },
      content: {
        subject: data.mail.subject,
        html: data.mail.content,
      },
      source: {
        name: apiKey.user.display_name || 'Tuturuuu',
        email: userEmail,
      },
      metadata: {
        wsId,
        userId: apiKey.user.id,
        templateType: 'internal-email',
        ipAddress,
      },
    });

    if (!result.success) {
      // Check if it was a rate limit issue
      if (result.rateLimitInfo && !result.rateLimitInfo.allowed) {
        return NextResponse.json(
          {
            message: 'Rate limit exceeded',
            retryAfter: result.rateLimitInfo.retryAfter,
          },
          { status: 429 }
        );
      }

      // Check if all recipients were blocked
      if (result.blockedRecipients && result.blockedRecipients.length > 0) {
        console.log('Some recipients were blocked:', result.blockedRecipients);
      }

      console.error('Email sending failed:', result.error);
      return NextResponse.json(
        { message: result.error || 'Failed to send email' },
        { status: 500 }
      );
    }

    const payload = DOMPurify.sanitize(data.mail.content);

    // Store the sent email in the internal_emails table for backwards compatibility
    const { error } = await sbAdmin
      .from('internal_emails')
      .insert({
        ws_id: wsId,
        user_id: apiKey.user.id,
        source_email: `${apiKey.user.display_name || 'Tuturuuu'} <${userEmail}>`,
        subject: data.mail.subject,
        to_addresses: data.mail.to,
        cc_addresses: data.mail.cc || [],
        bcc_addresses: data.mail.bcc || [],
        reply_to_addresses: [],
        payload,
        html_payload: true,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error logging sent email:', error);
      // Don't fail the request - email was already sent
    }

    const message = DEV_MODE
      ? 'Email saved (DEV_MODE, not sent)'
      : 'Email sent successfully';

    return NextResponse.json(
      {
        message,
        messageId: result.messageId,
        auditId: result.auditId,
        blockedRecipients: result.blockedRecipients,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error sending email:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
