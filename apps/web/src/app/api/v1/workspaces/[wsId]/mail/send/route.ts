import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import DOMPurify from 'isomorphic-dompurify';
import juice from 'juice';
import { difference } from 'lodash';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { DEV_MODE, IS_PRODUCTION_DB } from '@/constants/common';

const domainBlacklist = ['@easy.com'];
const ENABLE_MAIL_ON_DEV = true;

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ wsId: string }>;
  }
) {
  const { wsId } = await params;
  const apiKey = req.headers.get('Authorization')?.split(' ')[1];

  const data: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    content: string;
  } = await req.json();

  if (!data.to || !data.subject || !data.content) {
    console.log('Invalid request body');
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  // Get the current user
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error('User is unauthenticated');
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!isValidTuturuuuEmail(user.email)) {
    console.error('User is not using a valid Tuturuuu email');
    return NextResponse.json(
      { message: 'Only Tuturuuu emails are allowed' },
      { status: 401 }
    );
  }

  const { data: userProfile, error: userProfileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (userProfileError) {
    console.error('Error fetching user profile:', userProfileError);
    return NextResponse.json(
      { message: 'Error fetching user profile' },
      { status: 500 }
    );
  }

  if (!userProfile.display_name || !user.email) {
    console.error('User profile is missing required fields');
    return NextResponse.json(
      { message: 'User profile is missing required fields' },
      { status: 400 }
    );
  }

  if (DEV_MODE && IS_PRODUCTION_DB) {
    // Get allowed emails from internal_email_api_keys
    const { data: internalData, error: internalDataError } = await supabase
      .from('internal_email_api_keys')
      .select('*')
      .or(`user_id.eq.${user?.id},value.eq.${apiKey}`)
      .single();

    if (internalDataError) {
      console.error('Error fetching allowed emails:', internalDataError);
      return NextResponse.json(
        { message: 'Error fetching allowed emails' },
        { status: 500 }
      );
    }

    if (!internalData) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (
      internalData.allowed_emails &&
      difference(
        [...data.to, ...(data.cc || []), ...(data.bcc || [])],
        internalData.allowed_emails
      ).length > 0
    ) {
      console.error(
        'Email not allowed',
        { to: data.to, cc: data.cc, bcc: data.bcc },
        internalData.allowed_emails,
        difference(
          [...data.to, ...(data.cc || []), ...(data.bcc || [])],
          internalData.allowed_emails
        )
      );
      return NextResponse.json(
        { message: 'Email not allowed' },
        { status: 400 }
      );
    }
  }

  const sbAdmin = await createAdminClient();

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
    const sourceEmail = `${userProfile.display_name} <${user.email}>`;

    // Send the email via SES (unless in DEV_MODE or email sending is disabled)
    if (!DEV_MODE || ENABLE_MAIL_ON_DEV) {
      const emailSent = await sendEmail({
        client: sesClient,
        sourceEmail,
        toAddresses: data.to,
        ccAddresses: data.cc,
        bccAddresses: data.bcc,
        subject: data.subject,
        content: data.content,
      });

      if (!emailSent) {
        return NextResponse.json(
          { message: 'Failed to send email' },
          { status: 500 }
        );
      }
    }

    const payload = DOMPurify.sanitize(data.content);

    // Store the sent email in the database (always, regardless of DEV_MODE)
    const { error } = await sbAdmin
      .from('internal_emails')
      .insert({
        ws_id: wsId,
        user_id: user.id,
        source_email: sourceEmail,
        subject: data.subject,
        to_addresses: data.to,
        cc_addresses: data.cc || [],
        bcc_addresses: data.bcc || [],
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
