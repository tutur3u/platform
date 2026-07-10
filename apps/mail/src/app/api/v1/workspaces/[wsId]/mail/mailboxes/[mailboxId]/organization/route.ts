import { type NextRequest, NextResponse } from 'next/server';
import { listMailboxOrganization } from '@/lib/mail/repository';
import { withMailContext } from '@/lib/mail/route-utils';

type RouteParams = { mailboxId: string; wsId: string };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, wsId } = await params;
  return withMailContext(request, wsId, async (ctx) => {
    const organization = await listMailboxOrganization({ ctx, mailboxId });
    return organization
      ? NextResponse.json(organization)
      : NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  });
}
