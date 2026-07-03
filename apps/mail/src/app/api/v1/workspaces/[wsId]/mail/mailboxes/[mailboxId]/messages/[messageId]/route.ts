import { type NextRequest, NextResponse } from 'next/server';
import { getMailMessage } from '@/lib/mail/repository';
import { withMailContext } from '@/lib/mail/route-utils';

type RouteParams = {
  mailboxId: string;
  messageId: string;
  wsId: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, messageId, wsId } = await params;

  return withMailContext(request, wsId, async (ctx) => {
    const message = await getMailMessage({ ctx, mailboxId, messageId });

    if (!message) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(message);
  });
}
