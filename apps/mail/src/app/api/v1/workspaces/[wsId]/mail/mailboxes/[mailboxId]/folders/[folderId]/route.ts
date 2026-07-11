import { type NextRequest, NextResponse } from 'next/server';
import {
  deleteMailboxFolder,
  updateMailboxFolder,
} from '@/lib/mail/repository';
import { parseJsonBody, withMailContext } from '@/lib/mail/route-utils';
import { updateMailOrganizationSchema } from '@/lib/mail/schemas';

type RouteParams = { folderId: string; mailboxId: string; wsId: string };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { folderId, mailboxId, wsId } = await params;
  const body = await parseJsonBody(request, updateMailOrganizationSchema);
  if (!body.ok) return body.response;
  return withMailContext(request, wsId, async (ctx) => {
    const folder = await updateMailboxFolder({
      ctx,
      folderId,
      mailboxId,
      payload: body.data,
    });
    return folder
      ? NextResponse.json({ folder })
      : NextResponse.json({ error: 'Not found' }, { status: 404 });
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { folderId, mailboxId, wsId } = await params;
  return withMailContext(request, wsId, async (ctx) => {
    const deleted = await deleteMailboxFolder({ ctx, folderId, mailboxId });
    return deleted
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json({ error: 'Not found' }, { status: 404 });
  });
}
