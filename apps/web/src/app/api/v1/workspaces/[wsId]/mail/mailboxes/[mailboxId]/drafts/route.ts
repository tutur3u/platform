import { type NextRequest, NextResponse } from 'next/server';
import { createMailDraft } from '@/lib/mail/repository';
import { parseJsonBody, withMailContext } from '@/lib/mail/route-utils';
import { mailDraftPayloadSchema } from '@/lib/mail/schemas';

type RouteParams = {
  mailboxId: string;
  wsId: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, wsId } = await params;
  const body = await parseJsonBody(request, mailDraftPayloadSchema);
  if (!body.ok) return body.response;

  return withMailContext(request, wsId, async (ctx) => {
    const message = await createMailDraft({
      ctx,
      mailboxId,
      payload: body.data,
    });

    if (!message) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ message });
  });
}
