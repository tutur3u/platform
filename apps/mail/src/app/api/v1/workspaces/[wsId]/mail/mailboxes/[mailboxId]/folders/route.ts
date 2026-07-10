import { type NextRequest, NextResponse } from 'next/server';
import { createMailboxFolder } from '@/lib/mail/repository';
import { parseJsonBody, withMailContext } from '@/lib/mail/route-utils';
import { createMailOrganizationSchema } from '@/lib/mail/schemas';

type RouteParams = { mailboxId: string; wsId: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, wsId } = await params;
  const body = await parseJsonBody(request, createMailOrganizationSchema);
  if (!body.ok) return body.response;
  return withMailContext(request, wsId, async (ctx) => {
    const folder = await createMailboxFolder({
      ctx,
      mailboxId,
      payload: body.data,
    });
    return folder
      ? NextResponse.json({ folder }, { status: 201 })
      : NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  });
}
