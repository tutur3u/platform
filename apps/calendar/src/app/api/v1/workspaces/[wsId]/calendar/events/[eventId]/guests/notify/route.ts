import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  NotifyGuestsSchema,
  notifyEventGuests,
} from '@/lib/calendar/invitations/guests';
import {
  eventDecryptor,
  invitationDeps,
  invitationErrorResponse,
  NO_STORE,
} from '@/lib/calendar/invitations/route-support';
import { authorizeCalendarEventManagement } from '@/lib/calendar-event-permission';
import { checkRateLimit } from '@/lib/rate-limit';

/** Send an update (or cancellation) of a saved event to invited guests. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string; eventId: string }> }
) {
  const { wsId: rawWsId, eventId } = await params;
  const access = await authorizeCalendarEventManagement(request, rawWsId);
  if ('error' in access) return access.error;
  const body = NotifyGuestsSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!z.guid().safeParse(eventId).success || !body.success)
    return NextResponse.json(
      { error: 'Invalid notification request' },
      { status: 400, headers: NO_STORE }
    );

  const quota = await checkRateLimit(
    `calendar:guests:notify:user:${access.userId}`,
    { windowMs: 60_000, maxRequests: 10 }
  );
  if (!('allowed' in quota)) return quota;

  try {
    const delivery = await notifyEventGuests(
      invitationDeps(access.sbAdmin, request),
      {
        wsId: access.wsId,
        eventId,
        actorUserId: access.userId,
        kind: body.data.kind,
        display: body.data.display,
        decrypt: eventDecryptor(access.wsId),
      }
    );
    return NextResponse.json({ delivery }, { headers: NO_STORE });
  } catch (error) {
    return invitationErrorResponse(error, 'notify guests');
  }
}
