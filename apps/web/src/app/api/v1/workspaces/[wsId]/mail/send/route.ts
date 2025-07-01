import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import juice from 'juice';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

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
  const sbAdmin = await createAdminClient();

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

  // Get workspace email credentials
  const { data: credentials, error: credentialsError } = await sbAdmin
    .from('workspace_email_credentials')
    .select('*')
    .eq('ws_id', wsId)
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

  // Get the current user
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
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
    // Send the email
    const result = await sendEmail({
      client: sesClient,
      sourceName: credentials.source_name,
      sourceEmail: credentials.source_email,
      senderId: user.id,
      recipient: data.to,
      subject: data.subject,
      content: data.content,
      wsId,
    });

    if (result) {
      return NextResponse.json(
        { message: 'Email sent successfully' },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        { message: 'Failed to send email' },
        { status: 500 }
      );
    }
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
  senderId,
  recipient,
  subject,
  content,
  wsId,
}: {
  client: SESClient;
  sourceName: string;
  sourceEmail: string;
  senderId: string;
  recipient: string;
  subject: string;
  content: string;
  wsId: string;
}) => {
  try {
    const supabase = await createAdminClient();

    // Check if email is blacklisted
    if (domainBlacklist.some((domain) => recipient.includes(domain))) {
      console.log('Email domain is blacklisted:', recipient);
      return false;
    }

    // Convert plain text content to HTML and inline CSS
    const htmlContent = content.replace(/\n/g, '<br>');
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

    // Store the sent email in the database
    const { error } = await supabase
      .from('sent_emails')
      .insert({
        sender_id: senderId,
        receiver_id: senderId, // For general emails, use sender as receiver
        email: recipient,
        subject,
        content: inlinedHtmlContent,
        source_name: sourceName,
        source_email: sourceEmail,
        ws_id: wsId,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error logging sent email:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error sending email:', err);
    return false;
  }
};
