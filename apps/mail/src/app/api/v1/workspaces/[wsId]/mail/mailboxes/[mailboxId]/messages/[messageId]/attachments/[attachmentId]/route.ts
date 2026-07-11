import { type NextRequest, NextResponse } from 'next/server';
import { getAuthorizedAttachment } from '@/lib/mail/repository';
import { withMailContext } from '@/lib/mail/route-utils';
import { streamMailStoredObject } from '@/lib/mail/storage';

type RouteParams = {
  attachmentId: string;
  mailboxId: string;
  messageId: string;
  wsId: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { attachmentId, mailboxId, messageId, wsId } = await params;
  return withMailContext(request, wsId, async (ctx) => {
    const authorized = await getAuthorizedAttachment({
      attachmentId,
      ctx,
      mailboxId,
      messageId,
    });
    if (!authorized) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const requestedRange = request.headers.get('range');
    const range =
      requestedRange && /^bytes=\d*-\d*$/u.test(requestedRange)
        ? requestedRange
        : undefined;
    const object = await streamMailStoredObject({
      location: authorized.location,
      range,
    });
    const filename = authorized.attachment.filename.replaceAll(
      /[\r\n"]/gu,
      '_'
    );
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `${
        authorized.attachment.disposition === 'inline' ? 'inline' : 'attachment'
      }; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Type':
        object.contentType ??
        authorized.attachment.content_type ??
        'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    if (object.contentLength != null) {
      headers.set('Content-Length', String(object.contentLength));
    }
    if (object.contentRange) headers.set('Content-Range', object.contentRange);
    if (object.etag) headers.set('ETag', object.etag);
    return new NextResponse(object.body, {
      headers,
      status: object.contentRange ? 206 : 200,
    });
  });
}
