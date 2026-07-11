import { type NextRequest, NextResponse } from 'next/server';
import {
  deleteDraftAttachment,
  getAuthorizedAttachment,
} from '@/lib/mail/repository';
import { withMailContext } from '@/lib/mail/route-utils';
import { streamMailStoredObject } from '@/lib/mail/storage';

type RouteParams = {
  attachmentId: string;
  draftId: string;
  mailboxId: string;
  wsId: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { attachmentId, draftId, mailboxId, wsId } = await params;
  return withMailContext(request, wsId, async (ctx) => {
    const authorized = await getAuthorizedAttachment({
      attachmentId,
      ctx,
      mailboxId,
      messageId: draftId,
    });
    if (!authorized) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const object = await streamMailStoredObject({
      location: authorized.location,
    });
    const headers = new Headers({
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline',
      'Content-Type':
        object.contentType ??
        authorized.attachment.content_type ??
        'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    if (object.contentLength != null) {
      headers.set('Content-Length', String(object.contentLength));
    }
    return new NextResponse(object.body, { headers });
  });
}

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
