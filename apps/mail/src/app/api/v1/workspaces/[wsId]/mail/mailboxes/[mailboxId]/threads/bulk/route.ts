import { type NextRequest, NextResponse } from 'next/server';
import { bulkUpdateMailThreads } from '@/lib/mail/repository';
import { parseJsonBody, withMailContext } from '@/lib/mail/route-utils';
import { mailThreadBulkPayloadSchema } from '@/lib/mail/schemas';

type RouteParams = { mailboxId: string; wsId: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { mailboxId, wsId } = await params;
  const body = await parseJsonBody(request, mailThreadBulkPayloadSchema);
  if (!body.ok) return body.response;
  return withMailContext(request, wsId, async (ctx) => {
    const result = await bulkUpdateMailThreads({
      ctx,
      mailboxId,
      payload: body.data,
    });
    return result
      ? NextResponse.json(result)
      : NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  });
}
