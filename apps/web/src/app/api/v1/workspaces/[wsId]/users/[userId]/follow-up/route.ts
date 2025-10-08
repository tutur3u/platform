import { DEV_MODE, PROD_API_URL } from '@/constants/common';
import { createAdminClient, createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import DOMPurify from 'isomorphic-dompurify';
import juice from 'juice';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { SESClient } from '@aws-sdk/client-ses';

// const domainBlacklist = ['@easy.com'];
// const ENABLE_MAIL_ON_DEV = false; // Not used in this implementation

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ wsId: string; userId: string }>;
  }
) {
  const { wsId, userId } = await params;

  const data: {
    source_name?: string;
    source_email?: string;
    subject?: string;
    content?: string;
    to_email?: string;
    post_id?: string;
  } = await req.json();

  if (!data?.source_name || !data?.source_email || !data?.subject || !data?.content) {
    console.log('Invalid request body');
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }


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

  // Validate source email
  if (!isValidTuturuuuEmail(data.source_email)) {
    console.error('Source email is not a valid Tuturuuu email');
    return NextResponse.json(
      { message: 'Only Tuturuuu emails are allowed as source' },
      { status: 401 }
    );
  }

//   // Check if email is blacklisted
//   if (domainBlacklist.some((domain) => toEmail.includes(domain))) {
//     console.log('Email domain is blacklisted:', toEmail);
//     return NextResponse.json(
//       { message: 'Email domain is blacklisted' },
//       { status: 400 }
//     );
//   }

  try {
    // Create RPC call payload
    const rpcPayload = {
      p_ws_id: wsId,
      p_sender_id: authUser.id, // Using authenticated user's ID as sender
      p_receiver_id: userId,
      p_source_name: data.source_name,
      p_source_email: data.source_email,
      p_subject: data.subject,
      p_content: data.content,
      p_email: toEmail,
      p_post_id: data.post_id || undefined,
    };

    // Call the RPC function to create the guest lead email
    const { data: rpcData, error: rpcError } = await sbAdmin.rpc(
      'create_guest_lead_email',
      rpcPayload
    );

    if (rpcError) {
      console.error('Error calling RPC:', rpcError);
      return NextResponse.json(
        { message: 'Failed to create guest lead email' },
        { status: 500 }
      );
    }

    // Prepare email sending logic based on DEV_MODE
    let emailSent = false;
    let message = '';

    if (DEV_MODE) {
      // Validate required environment variables for DEV_MODE
      const sourceEmail = process.env.SOURCE_EMAIL;
      const emailAccessKeyId = process.env.EMAIL_ACCESS_KEY_ID;
      const emailAccessKeySecret = process.env.EMAIL_ACCESS_KEY_SECRET;

      if (!sourceEmail || !emailAccessKeyId || !emailAccessKeySecret) {
        console.error('Missing required environment variables for DEV_MODE:', {
          SOURCE_EMAIL: !!sourceEmail,
          EMAIL_ACCESS_KEY_ID: !!emailAccessKeyId,
          EMAIL_ACCESS_KEY_SECRET: !!emailAccessKeySecret,
        });
        return NextResponse.json(
          { message: 'Missing required environment variables for DEV_MODE' },
          { status: 500 }
        );
      }

      // In DEV_MODE, send to the dev endpoint
      const devApiPayload = {
        mail: {
          to: [sourceEmail], // Override with SOURCE_EMAIL in dev
          subject: data.subject,
          content: data.content,
        },
        config: {
          accessKeyId: emailAccessKeyId,
          accessKeySecret: emailAccessKeySecret,
        },
      };

      try {
        const devResponse = await fetch(
          `${PROD_API_URL}/v1/workspaces/${ROOT_WORKSPACE_ID}/mail/send`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(devApiPayload),
          }
        );

        if (devResponse.ok) {
          emailSent = true;
          message = 'Email sent via proxy production endpoint';
        } else {
          console.error('Dev endpoint failed:', await devResponse.text());
          message = 'Dev endpoint failed, but email logged';
        }
      } catch (error) {
        console.error('Error calling dev endpoint:', error);
        message = 'Dev endpoint error, but email logged';
      }
    } else {
      // In production, use SES directly
      const { data: credentials, error: credentialsError } = await sbAdmin
        .from('workspace_email_credentials')
        .select('*')
        .eq('ws_id', ROOT_WORKSPACE_ID)
        .maybeSingle();

      if (credentialsError || !credentials) {
        console.error('Error fetching credentials:', credentialsError);
        return NextResponse.json(
          { message: 'Error fetching email credentials' },
          { status: 500 }
        );
      }

      // Import SES client dynamically to avoid issues in dev mode
      const { SESClient } = await import('@aws-sdk/client-ses');
      
      const sesClient = new SESClient({
        region: credentials.region,
        credentials: {
          accessKeyId: credentials.access_id,
          secretAccessKey: credentials.access_key,
        },
      });

      emailSent = await sendEmail({
        client: sesClient,
        sourceEmail: `${data.source_name} <${data.source_email}>`,
        toAddresses: [toEmail],
        ccAddresses: [],
        bccAddresses: [],
        subject: data.subject,
        content: data.content,
      });

      message = emailSent ? 'Email sent successfully' : 'Failed to send email';
    }

    return NextResponse.json(
      { 
        message,
        emailSent,
        mail_id: (rpcData as any)?.mail_id,
        status: emailSent ? 'sent' : 'logged'
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

    // Send email via SES
    console.log('Sending email:', { to: toAddresses, subject });
    const { SendEmailCommand } = await import('@aws-sdk/client-ses');
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
