import { type NextRequest, NextResponse } from 'next/server';
import { bulkUpdateMail } from '@/lib/mail/repository';
import { parseJsonBody, withMailContext } from '@/lib/mail/route-utils';
import { mailBulkPayloadSchema } from '@/lib/mail/schemas';

type RouteParams = { mailboxId: string; wsId: string };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, wsId } = await params;
  const body = await parseJsonBody(request, mailBulkPayloadSchema);
  if (!body.ok) return body.response;
  return withMailContext(request, wsId, async (ctx) => {
    const result = await bulkUpdateMail({ ctx, mailboxId, payload: body.data });
    return result
      ? NextResponse.json(result)
      : NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  });
}
