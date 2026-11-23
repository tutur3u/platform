import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  GuestPatchSchema,
  removeEventGuest,
  updateEventGuest,
} from '@/lib/calendar/invitations/guests';
import {
  eventDecryptor,
  invitationDeps,
  invitationErrorResponse,
  NO_STORE,
} from '@/lib/calendar/invitations/route-support';
import { authorizeCalendarEventManagement } from '@/lib/calendar-event-permission';

type Params = {
  params: Promise<{ wsId: string; eventId: string; guestId: string }>;
};

function validIds(eventId: string, guestId: string) {
  return (
    z.guid().safeParse(eventId).success && z.guid().safeParse(guestId).success
  );
}

export async function PATCH(request: Request, { params }: Params) {
  const { wsId: rawWsId, eventId, guestId } = await params;
  const access = await authorizeCalendarEventManagement(request, rawWsId);
  if ('error' in access) return access.error;
  const body = GuestPatchSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!validIds(eventId, guestId) || !body.success)
    return NextResponse.json(
      { error: 'Invalid guest' },
      { status: 400, headers: NO_STORE }
    );
  try {
    const guest = await updateEventGuest(access.sbAdmin, {
      wsId: access.wsId,
      eventId,
      guestId,
      optional: body.data.optional,
    });
    return NextResponse.json(
      { id: guest.id, isOptional: guest.is_optional },
      { headers: NO_STORE }
    );
  } catch (error) {
    return invitationErrorResponse(error, 'update guest');
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { wsId: rawWsId, eventId, guestId } = await params;
  const access = await authorizeCalendarEventManagement(request, rawWsId);
  if ('error' in access) return access.error;
  if (!validIds(eventId, guestId))
    return NextResponse.json(
      { error: 'Invalid guest' },
      { status: 400, headers: NO_STORE }
    );
  const notify = new URL(request.url).searchParams.get('notify') !== 'false';
  try {
    await removeEventGuest(invitationDeps(access.sbAdmin, request), {
      wsId: access.wsId,
      eventId,
      guestId,
      actorUserId: access.userId,
      notify,
      decrypt: eventDecryptor(access.wsId),
    });
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  } catch (error) {
    return invitationErrorResponse(error, 'remove guest');
  }
}
