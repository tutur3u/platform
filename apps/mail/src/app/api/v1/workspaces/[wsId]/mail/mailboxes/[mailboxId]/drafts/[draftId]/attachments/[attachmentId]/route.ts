import { type NextRequest, NextResponse } from 'next/server';
import { deleteDraftAttachment } from '@/lib/mail/repository';
import { withMailContext } from '@/lib/mail/route-utils';

type RouteParams = {
  attachmentId: string;
  draftId: string;
  mailboxId: string;
  wsId: string;
};

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { attachmentId, draftId, mailboxId, wsId } = await params;
  return withMailContext(request, wsId, async (ctx) => {
    const deleted = await deleteDraftAttachment({
      attachmentId,
      ctx,
      draftId,
      mailboxId,
    });
    return deleted
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json({ error: 'Not found' }, { status: 404 });
  });
}
