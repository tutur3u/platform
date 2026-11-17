import { type NextRequest, NextResponse } from 'next/server';
import { getAuthorizedMailRawSource } from '@/lib/mail/repository/raw-source';
import { withMailContext } from '@/lib/mail/route-utils';
import { streamMailStoredObject } from '@/lib/mail/storage';

type RouteParams = { wsId: string; mailboxId: string; messageId: string };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { wsId, mailboxId, messageId } = await params;
  return withMailContext(request, wsId, async (ctx) => {
    const location = await getAuthorizedMailRawSource({
      ctx,
      mailboxId,
      messageId,
    });
    if (!location)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const object = await streamMailStoredObject({ location });
    return new NextResponse(object.body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="message.eml"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "sandbox; default-src 'none'; frame-ancestors 'none'",
      },
    });
  });
}
