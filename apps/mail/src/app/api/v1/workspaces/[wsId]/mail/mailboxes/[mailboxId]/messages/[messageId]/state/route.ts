import { type NextRequest, NextResponse } from 'next/server';
import { updateMailMessageState } from '@/lib/mail/repository';
import { parseJsonBody, withMailContext } from '@/lib/mail/route-utils';
import { updateMailStatePayloadSchema } from '@/lib/mail/schemas';

type RouteParams = {
  mailboxId: string;
  messageId: string;
  wsId: string;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, messageId, wsId } = await params;
  const body = await parseJsonBody(request, updateMailStatePayloadSchema);
  if (!body.ok) return body.response;

  return withMailContext(request, wsId, async (ctx) => {
    const message = await updateMailMessageState({
      ctx,
      mailboxId,
      messageId,
      payload: body.data,
    });

    if (!message) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ message });
  });
}
