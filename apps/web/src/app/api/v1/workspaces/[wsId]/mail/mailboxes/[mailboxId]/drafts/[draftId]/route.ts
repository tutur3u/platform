import { type NextRequest, NextResponse } from 'next/server';
import { deleteMailDraft, updateMailDraft } from '@/lib/mail/repository';
import { parseJsonBody, withMailContext } from '@/lib/mail/route-utils';
import { mailDraftPatchPayloadSchema } from '@/lib/mail/schemas';

type RouteParams = {
  draftId: string;
  mailboxId: string;
  wsId: string;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { draftId, mailboxId, wsId } = await params;
  const body = await parseJsonBody(request, mailDraftPatchPayloadSchema);
  if (!body.ok) return body.response;

  return withMailContext(request, wsId, async (ctx) => {
    const message = await updateMailDraft({
      ctx,
      draftId,
      mailboxId,
      payload: body.data,
    });

    if (!message) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ message });
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { draftId, mailboxId, wsId } = await params;

  return withMailContext(request, wsId, async (ctx) => {
    const deleted = await deleteMailDraft({ ctx, draftId, mailboxId });

    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  });
}
