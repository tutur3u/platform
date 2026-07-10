import { type NextRequest, NextResponse } from 'next/server';
import { listMailMessages, sendMailMessage } from '@/lib/mail/repository';
import { parseJsonBody, withMailContext } from '@/lib/mail/route-utils';
import { sendMailPayloadSchema } from '@/lib/mail/schemas';

type RouteParams = {
  mailboxId: string;
  wsId: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, wsId } = await params;
  const searchParams = request.nextUrl.searchParams;

  return withMailContext(request, wsId, async (ctx) => {
    const payload = await listMailMessages({
      ctx,
      mailboxId,
      params: {
        folder:
          (searchParams.get('folder') as
            | 'archive'
            | 'drafts'
            | 'inbox'
            | 'sent'
            | 'spam'
            | 'starred'
            | 'trash'
            | null) ?? 'inbox',
        label: searchParams.get('label') ?? undefined,
        folderId: searchParams.get('folderId') ?? undefined,
        page: Number(searchParams.get('page') ?? 1),
        pageSize: Number(searchParams.get('pageSize') ?? 40),
        query: searchParams.get('query') ?? undefined,
      },
    });

    if (!payload) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(payload);
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, wsId } = await params;
  const body = await parseJsonBody(request, sendMailPayloadSchema);
  if (!body.ok) return body.response;

  return withMailContext(request, wsId, async (ctx) => {
    const message = await sendMailMessage({
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
