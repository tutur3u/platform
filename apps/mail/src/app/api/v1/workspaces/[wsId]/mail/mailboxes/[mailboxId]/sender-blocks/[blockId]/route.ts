import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withMailContext } from '@/lib/mail/route-utils';
import { removeSenderBlock } from '@/lib/mail/sender-blocks/store';

type RouteParams = { blockId: string; mailboxId: string; wsId: string };

const noStore = { 'Cache-Control': 'private, no-store' };

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { blockId, mailboxId, wsId } = await params;
  if (!z.uuid().safeParse(blockId).success)
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: noStore }
    );
  const restoreToInbox =
    request.nextUrl.searchParams.get('restoreToInbox') === 'true';
  return withMailContext(request, wsId, async (ctx) => {
    const result = await removeSenderBlock({
      ctx,
      mailboxId,
      blockId,
      restoreToInbox,
    });
    if (result.status === 'forbidden')
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: noStore }
      );
    if (result.status === 'not_found')
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: noStore }
      );
    return NextResponse.json({ moved: result.moved }, { headers: noStore });
  });
}
