import { DEV_MODE } from '@/constants/common';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import DOMPurify from 'isomorphic-dompurify';
import juice from 'juice';
import { difference } from 'lodash';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const domainBlacklist = ['@easy.com'];
const ENABLE_MAIL_ON_DEV = false;

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

  if (!isValidTuturuuuEmail(apiKey?.user.email)) {
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

  // Get workspace email credentials
  const { data: credentials, error: credentialsError } = await sbAdmin
    .from('workspace_email_credentials')
    .select('*')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .maybeSingle();

  if (credentialsError) {
    console.error('Error fetching credentials:', credentialsError);
    return NextResponse.json(
      { message: 'Error fetching credentials' },
      { status: 500 }
    );
  }

  if (!credentials) {
    console.log('No credentials found');
    return NextResponse.json(
      { message: 'No credentials found' },
      { status: 400 }
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

  try {
    const sourceEmail = `${apiKey.user.display_name} <${apiKey.user.email}>`;

    // Send the email via SES (unless in DEV_MODE or email sending is disabled)
    if (!DEV_MODE || ENABLE_MAIL_ON_DEV) {
      const emailSent = await sendEmail({
        client: sesClient,
        sourceEmail,
        toAddresses: data.mail.to,
        ccAddresses: data.mail.cc,
        bccAddresses: data.mail.bcc,
        subject: data.mail.subject,
        content: data.mail.content,
      });

      if (!emailSent) {
        return NextResponse.json(
          { message: 'Failed to send email' },
          { status: 500 }
        );
      }
    }

    const payload = DOMPurify.sanitize(data.mail.content);

    // Store the sent email in the database (always, regardless of DEV_MODE)
    const { error } = await sbAdmin
      .from('internal_emails')
      .insert({
        ws_id: wsId,
        user_id: apiKey.user.id,
        source_email: sourceEmail,
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
      return NextResponse.json(
        { message: 'Failed to save email to database' },
        { status: 500 }
      );
    }

    const message = DEV_MODE
      ? 'Email saved (DEV_MODE, not sent)'
      : 'Email sent successfully';

    return NextResponse.json({ message }, { status: 200 });
  } catch (error) {
    console.error('Error sending email:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

const sendEmail = async ({
  client,
  sourceEmail,
  toAddresses,
  ccAddresses,
  bccAddresses,
  subject,
  content,
}: {
  client: SESClient;
  sourceEmail: string;
  toAddresses: string[];
  ccAddresses?: string[];
  bccAddresses?: string[];
  subject: string;
  content: string;
}) => {
  try {
    // Check if email is blacklisted
    if (
      domainBlacklist.some(
        (domain) =>
          toAddresses.some((addr) => addr.includes(domain)) ||
          ccAddresses?.some((addr) => addr.includes(domain)) ||
          bccAddresses?.some((addr) => addr.includes(domain))
      )
    ) {
      console.log('Email domain is blacklisted:', toAddresses);
      return false;
    }

    // Convert plain text content to HTML and inline CSS
    const htmlContent = DOMPurify.sanitize(content);
    const inlinedHtmlContent = juice(htmlContent);

    const params = {
      Source: sourceEmail,
      Destination: {
        ToAddresses: toAddresses,
        CcAddresses: ccAddresses,
        BccAddresses: bccAddresses,
      },
      Message: {
        Subject: { Data: subject },
        Body: {
          Html: { Data: inlinedHtmlContent },
          Text: { Data: content },
        },
      },
    };

    // Send email via SES (unless disabled)
    console.log('Sending email:', { to: toAddresses, subject });
    const command = new SendEmailCommand(params);
    const sesResponse = await client.send(command);

    if (sesResponse.$metadata.httpStatusCode !== 200) {
      console.error('Error sending email:', sesResponse);
      return false;
    }

    console.log('Email sent successfully:', { to: toAddresses, subject });

    return true;
  } catch (err) {
    console.error('Error sending email:', err);
    return false;
  }
};
