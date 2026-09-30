import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getMailInvitation,
  respondToMailInvitation,
} from '@/lib/mail/repository/calendar';
import { parseJsonBody, withMailContext } from '@/lib/mail/route-utils';

type Params = { wsId: string; mailboxId: string; messageId: string };
const schema = z
  .object({
    response: z.enum(['ACCEPTED', 'DECLINED', 'TENTATIVE']),
    requestId: z.string().uuid(),
  })
  .strict();
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  await connection();
  const { wsId, mailboxId, messageId } = await params;
  return withMailContext(request, wsId, async (ctx) => {
    const result = await getMailInvitation(ctx, mailboxId, messageId);
    const invitation = result?.invitation;
    return NextResponse.json(
      {
        invitation: invitation
          ? {
              summary: invitation.summary,
              organizer: invitation.organizer,
              attendee: invitation.attendee,
              start: invitation.start,
              location: invitation.location,
              joinUrl: invitation.joinUrl,
              reply: result?.reply ?? null,
              when: invitation.when,
            }
          : null,
      },
      { headers }
    );
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const body = await parseJsonBody(request, schema);
  if (!body.ok) return body.response;
  const { wsId, mailboxId, messageId } = await params;
  return withMailContext(request, wsId, async (ctx) => {
    const result = await respondToMailInvitation({
      ctx,
      mailboxId,
      messageId,
      ...body.data,
    });
    if (!result)
      return NextResponse.json(
        { error: 'Invitation unavailable' },
        { status: 403, headers }
      );
    return NextResponse.json(result, { headers });
  });
}
