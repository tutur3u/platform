import { DEV_MODE } from '@/constants/common';
import { getPermissions } from '@/lib/workspace-helper';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { createAdminClient, createClient } from '@tutur3u/supabase/next/server';
import dayjs from 'dayjs';
import juice from 'juice';
import { NextRequest, NextResponse } from 'next/server';

const forceEnableEmailSending = false;
const disableEmailSending = DEV_MODE && !forceEnableEmailSending;

const domainBlacklist = [
  // for initial customer migration
  'easy.com',
];

const sesClient = new SESClient({
  region: process.env.AWS_REGION as string,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  },
});

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

  const results = await Promise.all(
    data.users.map(async (user) => {
      const subject = `Easy Center | Báo cáo tiến độ ngày ${dayjs(data.date).format('DD/MM/YYYY')} của ${user.username}`;
      return sendEmail({
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

  return NextResponse.json({
    message: 'Emails sent and logged',
    successCount,
    failureCount,
  });
}

const sendEmail = async ({
  receiverId,
  recipient,
  subject,
  content,
  postId,
}: {
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
      Source: `${process.env.SOURCE_NAME} <${process.env.SOURCE_EMAIL}>`,
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
      await sesClient.send(command);
      console.log('Email sent:', params);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return false;
    }

    if (!process.env.SOURCE_NAME || !process.env.SOURCE_EMAIL) {
      return false;
    }

    const { data: sentEmail, error } = await supabase
      .from('sent_emails')
      .insert({
        post_id: postId,
        sender_id: user.id,
        receiver_id: receiverId,
        email: recipient,
        subject,
        content: inlinedHtmlContent,
        source_name: process.env.SOURCE_NAME,
        source_email: process.env.SOURCE_EMAIL,
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
