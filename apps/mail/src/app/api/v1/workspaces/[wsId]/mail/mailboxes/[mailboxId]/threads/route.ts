import { type NextRequest, NextResponse } from 'next/server';
import { listMailThreads } from '@/lib/mail/repository';
import { withMailContext } from '@/lib/mail/route-utils';

type RouteParams = { mailboxId: string; wsId: string };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, wsId } = await params;
  const searchParams = request.nextUrl.searchParams;
  return withMailContext(request, wsId, async (ctx) => {
    const payload = await listMailThreads({
      ctx,
      mailboxId,
      params: {
        folder: (searchParams.get('folder') as any) ?? 'inbox',
        folderId: searchParams.get('folderId') ?? undefined,
        label: searchParams.get('label') ?? undefined,
        page: Number(searchParams.get('page') ?? 1),
        pageSize: Number(searchParams.get('pageSize') ?? 40),
        query: searchParams.get('query') ?? undefined,
      },
    });
    return payload
      ? NextResponse.json(payload)
      : NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  });
}
