import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import dayjs from 'dayjs';
import juice from 'juice';
import { type NextRequest, NextResponse } from 'next/server';
import { DEV_MODE } from '@/constants/common';

const forceEnableEmailSending = false;
const disableEmailSending = DEV_MODE && !forceEnableEmailSending;

const domainBlacklist = [
  // for initial customer migration
  'easy.com',
];

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ wsId: string; postId: string }>;
  }
) {
  const sbAdmin = await createAdminClient();
  const { wsId, postId } = await params;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('send_user_group_post_emails')) {
    console.log('Permission denied');
    return NextResponse.json({ message: 'Permission denied' }, { status: 403 });
  }

  const { data: workspaceSecret } =
    wsId === process.env.MAILBOX_ALLOWED_WS_ID
      ? { data: { id: wsId, value: 'true' } }
      : await sbAdmin
          .from('workspace_secrets')
          .select('*')
          .eq('ws_id', wsId)
          .eq('name', 'ENABLE_EMAIL_SENDING')
          .maybeSingle();

  const isWSIDAllowed = workspaceSecret?.value === 'true';

  if (!isWSIDAllowed) {
    console.log('Workspace ID is not allowed');
    return NextResponse.json(
      { message: 'Workspace ID is not allowed' },
      { status: 403 }
    );
  }

  const data = (await req.json()) as {
    users: {
      id: string;
      email: string;
      content: string;
      username: string;
      notes: string;
      is_completed: boolean;
    }[];
    date: string;
  };

  if (!data.users) {
    console.log('Invalid request body');
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

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

  const sesClient = new SESClient({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.access_id,
      secretAccessKey: credentials.access_key,
    },
  });

  const results = await Promise.all(
    data.users.map(async (user) => {
      const subject = `Easy Center | Báo cáo tiến độ ngày ${dayjs(data.date).format('DD/MM/YYYY')} của ${user.username}`;
      return sendEmail({
        wsId,
        client: sesClient,
        sourceName: credentials.source_name,
        sourceEmail: credentials.source_email,
        receiverId: user.id,
        recipient: user.email,
        subject,
        content: user.content,
        postId,
      });
    })
  );

  const successCount = results.filter((result) => result).length;
  const failureCount = results.filter((result) => !result).length;

  return NextResponse.json(
    {
      message: 'Emails sent and logged',
      successCount,
      failureCount,
    },
    { status: failureCount > 0 ? 500 : successCount > 0 ? 200 : 404 }
  );
}

const sendEmail = async ({
  wsId,
  client,
  sourceName,
  sourceEmail,
  receiverId,
  recipient,
  subject,
  content,
  postId,
}: {
  wsId: string;
  client: SESClient;
  sourceName: string;
  sourceEmail: string;
  receiverId: string;
  recipient: string;
  subject: string;
  content: string;
  postId: string;
}) => {
  try {
    const supabase = await createClient();

    const { data } = await supabase
      .from('sent_emails')
      .select('*')
      .eq('receiver_id', receiverId)
      .eq('post_id', postId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      return false;
    }

    const inlinedHtmlContent = juice(content);

    const params = {
      Source: `${sourceName} <${sourceEmail}>`,
      Destination: {
        ToAddresses: [recipient],
      },
      Message: {
        Subject: { Data: subject },
        Body: {
          Html: { Data: inlinedHtmlContent },
        },
      },
    };

    if (
      !disableEmailSending &&
      !domainBlacklist.some((domain) => recipient.includes(domain))
    ) {
      console.log('Sending email:', params);
      const command = new SendEmailCommand(params);
      const sesResponse = await client.send(command);
      console.log('Email sent:', params);

      if (sesResponse.$metadata.httpStatusCode !== 200) {
        console.error('Error sending email:', sesResponse);
        return false;
      }

      console.log('Email sent successfully:', params);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return false;
    }

    if (!sourceName || !sourceEmail) {
      return false;
    }

    const { data: sentEmail, error } = await supabase
      .from('sent_emails')
      .insert({
        post_id: postId,
        ws_id: wsId,
        sender_id: user.id,
        receiver_id: receiverId,
        email: recipient,
        subject,
        content: inlinedHtmlContent,
        source_name: sourceName,
        source_email: sourceEmail,
      })
      .select('id')
      .single();

    if (!sentEmail) {
      console.error('Error logging sent email:', error);
      return false;
    }

    if (error) {
      console.error('Error logging sent email:', error);
      return false;
    }

    const { error: checkUpdateError } = await supabase
      .from('user_group_post_checks')
      .update({
        email_id: sentEmail.id,
      })
      .eq('post_id', postId)
      .eq('user_id', receiverId);

    if (checkUpdateError) {
      console.error('Error updating check:', checkUpdateError);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error sending email:', err);
    return false;
  }
};
