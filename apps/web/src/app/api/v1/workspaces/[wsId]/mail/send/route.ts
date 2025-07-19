import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import DOMPurify from 'isomorphic-dompurify';
import juice from 'juice';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { DEV_MODE } from '@/constants/common';

const domainBlacklist = ['@easy.com', '@easy'];
const disableEmailSending = process.env.DISABLE_EMAIL_SENDING === 'true';

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
    to: string;
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
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!user.email?.endsWith('@tuturuuu.com')) {
    return NextResponse.json(
      { message: 'Only @tuturuuu.com emails are allowed' },
      { status: 401 }
    );
  }

  const { data: userProfile, error: userProfileError } = await supabase
    .from('user_private_details')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (userProfileError) {
    console.error('Error fetching user profile:', userProfileError);
    return NextResponse.json(
      { message: 'Error fetching user profile' },
      { status: 500 }
    );
  }

  if (!userProfile.full_name || !userProfile.email) {
    return NextResponse.json(
      { message: 'User profile is missing required fields' },
      { status: 400 }
    );
  }

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
    !internalData.allowed_emails.includes(data.to)
  ) {
    return NextResponse.json({ message: 'Email not allowed' }, { status: 400 });
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
    // Send the email via SES (unless in DEV_MODE or email sending is disabled)
    if (!DEV_MODE) {
      const emailSent = await sendEmail({
        client: sesClient,
        sourceName: userProfile.full_name,
        sourceEmail: userProfile.email,
        recipient: data.to,
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
        user_id: internalData.user_id,
        source_email: userProfile.email,
        subject: data.subject,
        to_addresses: [data.to],
        cc_addresses: [],
        bcc_addresses: [],
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
  sourceName,
  sourceEmail,
  recipient,
  subject,
  content,
}: {
  client: SESClient;
  sourceName: string;
  sourceEmail: string;
  recipient: string;
  subject: string;
  content: string;
}) => {
  try {
    // Check if email is blacklisted
    if (domainBlacklist.some((domain) => recipient.includes(domain))) {
      console.log('Email domain is blacklisted:', recipient);
      return false;
    }

    // Convert plain text content to HTML and inline CSS
    const htmlContent = DOMPurify.sanitize(content);
    const inlinedHtmlContent = juice(htmlContent);

    const params = {
      Source: `${sourceName} <${sourceEmail}>`,
      Destination: {
        ToAddresses: [recipient],
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
    if (!disableEmailSending) {
      console.log('Sending email:', { to: recipient, subject });
      const command = new SendEmailCommand(params);
      const sesResponse = await client.send(command);

      if (sesResponse.$metadata.httpStatusCode !== 200) {
        console.error('Error sending email:', sesResponse);
        return false;
      }

      console.log('Email sent successfully:', { to: recipient, subject });
    } else {
      console.log('Email sending disabled, skipping SES:', {
        to: recipient,
        subject,
      });
    }

    return true;
  } catch (err) {
    console.error('Error sending email:', err);
    return false;
  }
};
