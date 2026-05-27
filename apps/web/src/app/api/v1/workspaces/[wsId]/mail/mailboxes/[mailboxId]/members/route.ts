import { type NextRequest, NextResponse } from 'next/server';
import { listMailboxMembers, upsertMailboxMember } from '@/lib/mail/repository';
import { parseJsonBody, withMailContext } from '@/lib/mail/route-utils';
import { upsertMailboxMemberPayloadSchema } from '@/lib/mail/schemas';

type RouteParams = {
  mailboxId: string;
  wsId: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, wsId } = await params;

  return withMailContext(request, wsId, async (ctx) => {
    const members = await listMailboxMembers({ ctx, mailboxId });

    if (!members) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ members });
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, wsId } = await params;
  const body = await parseJsonBody(request, upsertMailboxMemberPayloadSchema);
  if (!body.ok) return body.response;

  return withMailContext(request, wsId, async (ctx) => {
    const member = await upsertMailboxMember({
      ctx,
      mailboxId,
      payload: body.data,
    });

    if (!member) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ member });
  });
}
