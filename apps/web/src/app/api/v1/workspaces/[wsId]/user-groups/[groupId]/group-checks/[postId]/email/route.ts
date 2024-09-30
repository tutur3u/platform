import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import juice from 'juice';
import { NextRequest, NextResponse } from 'next/server';

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
    params: { wsId, groupId: _, postId: __ },
  }: {
    params: { wsId: string; groupId: string; postId: string };
  }
) {
  const isWSIDAllowed = wsId === process.env.MAILBOX_ALLOWED_WS_ID;

  if (!isWSIDAllowed) {
    return NextResponse.json(
      { message: 'Workspace ID is not allowed' },
      { status: 403 }
    );
  }

  const data = (await req.json()) as {
    users: {
      email: string;
      content: string;
      username: string;
      notes: string;
      is_completed: boolean;
    }[];
  };

  if (!data.users) {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  data.users.forEach(async (user) => {
    await sendEmail({
      recipients: [
        user.email,
        // 'phucvo@tuturuuu.com',
        // 'phathuynh@tuturuuu.com',
        // 'khanhdao@tuturuuu.com',
      ],
      subject: `Easy Center | Báo cáo tiến độ ngày ${new Date().toLocaleDateString()} của ${user.username}`,
      content: user.content,
    });
  });

  return NextResponse.json({ message: 'Data updated successfully' });
}

const sendEmail = async ({
  recipients,
  subject,
  content,
}: {
  recipients: string[];
  subject: string;
  content: string;
}) => {
  try {
    const inlinedHtmlContent = juice(content);

    const params = {
      Source: `${process.env.SOURCE_NAME} <${process.env.SOURCE_EMAIL}>`,
      Destination: {
        ToAddresses: recipients,
      },
      Message: {
        Subject: { Data: subject },
        Body: {
          Html: { Data: inlinedHtmlContent },
        },
      },
    };

    const command = new SendEmailCommand(params);
    await sesClient.send(command);
  } catch (err) {
    console.error(err);
  }
};
