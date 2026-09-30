import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  invitationAssociationKey,
  invitationLinkIdentity,
} from './calendar-link';
import { getMailInvitation } from './repository/calendar';
import { mailCalendarLinks } from './repository/calendar-links';
import { parseJsonBody, withMailContext } from './route-utils';

type Params = { wsId: string; mailboxId: string; messageId: string };
const selection = z
  .object({
    calendarWorkspaceId: z.union([z.guid(), z.literal('personal')]),
    eventId: z.guid(),
  })
  .strict();
const confirmation = selection
  .extend({ receipt: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
const unlink = z
  .object({ receipt: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
const headers = { 'Cache-Control': 'private, no-store' };
export async function mailCalendarLinkRoute(
  request: NextRequest,
  params: Promise<Params>,
  operation: 'get' | 'preview' | 'confirm' | 'unlink'
) {
  if (operation === 'get') await connection();
  const body =
    operation === 'get'
      ? null
      : await parseJsonBody(
          request,
          operation === 'preview'
            ? selection
            : operation === 'confirm'
              ? confirmation
              : unlink
        );
  if (body && !body.ok) return body.response;
  const { wsId, mailboxId, messageId } = await params;
  return withMailContext(request, wsId, async (ctx) => {
    const { service, readAssociation } = mailCalendarLinks(
      ctx,
      request.headers,
      mailboxId,
      messageId
    );
    const source = await getMailInvitation(ctx, mailboxId, messageId);
    if (!source)
      return NextResponse.json(
        operation === 'get'
          ? { target: null, association: null }
          : operation === 'preview'
            ? { preview: null }
            : { status: 'unavailable' },
        { headers }
      );
    const key = invitationAssociationKey(
      invitationLinkIdentity(ctx.user.id, mailboxId, source.invitation)
    );
    if (operation === 'get')
      return NextResponse.json(
        {
          target: await service.linkedTarget(ctx.user.id, mailboxId, messageId),
          association: await readAssociation(ctx.user.id, key),
        },
        { headers }
      );
    if (!body?.ok) throw new Error('Missing validated body');
    if (operation === 'unlink') {
      const input = unlink.parse(body.data);
      const previous = await readAssociation(ctx.user.id, key);
      if (!previous)
        return NextResponse.json({ status: 'unlinked' }, { headers });
      if (previous.receipt !== input.receipt)
        return NextResponse.json({ status: 'changed' }, { headers });
      return NextResponse.json(
        await service.unlink(
          ctx.user.id,
          mailboxId,
          messageId,
          previous.target
        ),
        { headers }
      );
    }
    const input =
      operation === 'confirm'
        ? confirmation.parse(body.data)
        : selection.parse(body.data);
    const workspaceId = await normalizeWorkspaceId(
      input.calendarWorkspaceId,
      ctx.supabase,
      request
    );
    const value = {
      actorId: ctx.user.id,
      mailboxId,
      messageId,
      workspaceId,
      eventId: input.eventId,
    };
    return NextResponse.json(
      operation === 'preview'
        ? { preview: await service.preview(value) }
        : await service.confirm(value, confirmation.parse(body.data).receipt),
      { headers }
    );
  });
}
