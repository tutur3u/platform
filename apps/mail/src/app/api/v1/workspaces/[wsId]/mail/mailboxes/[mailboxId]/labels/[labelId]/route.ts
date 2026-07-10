import { type NextRequest, NextResponse } from 'next/server';
import { deleteMailboxLabel, updateMailboxLabel } from '@/lib/mail/repository';
import { parseJsonBody, withMailContext } from '@/lib/mail/route-utils';
import { updateMailOrganizationSchema } from '@/lib/mail/schemas';

type RouteParams = { labelId: string; mailboxId: string; wsId: string };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { labelId, mailboxId, wsId } = await params;
  const body = await parseJsonBody(request, updateMailOrganizationSchema);
  if (!body.ok) return body.response;
  return withMailContext(request, wsId, async (ctx) => {
    const label = await updateMailboxLabel({
      ctx,
      labelId,
      mailboxId,
      payload: body.data,
    });
    return label
      ? NextResponse.json({ label })
      : NextResponse.json({ error: 'Not found' }, { status: 404 });
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { labelId, mailboxId, wsId } = await params;
  return withMailContext(request, wsId, async (ctx) => {
    const deleted = await deleteMailboxLabel({ ctx, labelId, mailboxId });
    return deleted
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json({ error: 'Not found' }, { status: 404 });
  });
}
