import { type NextRequest, NextResponse } from 'next/server';
import { removeMailboxMember } from '@/lib/mail/repository';
import { withMailContext } from '@/lib/mail/route-utils';

type RouteParams = {
  mailboxId: string;
  userId: string;
  wsId: string;
};

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, userId, wsId } = await params;

  return withMailContext(request, wsId, async (ctx) => {
    const deleted = await removeMailboxMember({ ctx, mailboxId, userId });

    if (!deleted) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return new NextResponse(null, { status: 204 });
  });
}
