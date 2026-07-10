import { type NextRequest, NextResponse } from 'next/server';
import { getMailThread, updateMailThreadState } from '@/lib/mail/repository';
import { parseJsonBody, withMailContext } from '@/lib/mail/route-utils';
import { updateMailStatePayloadSchema } from '@/lib/mail/schemas';

type RouteParams = {
  mailboxId: string;
  threadId: string;
  wsId: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, threadId, wsId } = await params;
  return withMailContext(request, wsId, async (ctx) => {
    const thread = await getMailThread({ ctx, mailboxId, threadId });
    return thread
      ? NextResponse.json(thread)
      : NextResponse.json({ error: 'Not found' }, { status: 404 });
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, threadId, wsId } = await params;
  const body = await parseJsonBody(request, updateMailStatePayloadSchema);
  if (!body.ok) return body.response;

  return withMailContext(request, wsId, async (ctx) => {
    const thread = await updateMailThreadState({
      ctx,
      mailboxId,
      payload: body.data,
      threadId,
    });
    return thread
      ? NextResponse.json(thread)
      : NextResponse.json({ error: 'Not found' }, { status: 404 });
  });
}
