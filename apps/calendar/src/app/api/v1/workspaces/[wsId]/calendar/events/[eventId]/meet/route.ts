import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  linkEventMeeting,
  unlinkEventMeeting,
} from '@/lib/calendar/invitations/meet-link';
import {
  eventDecryptor,
  invitationErrorResponse,
  NO_STORE,
} from '@/lib/calendar/invitations/route-support';
import { authorizeCalendarEventManagement } from '@/lib/calendar-event-permission';
import { checkRateLimit } from '@/lib/rate-limit';

type Params = { params: Promise<{ wsId: string; eventId: string }> };

const LinkSchema = z.object({ meetingId: z.guid().optional() }).strict();

/** Create a Tuturuuu Meet room for the event, or link an existing one. */
export async function POST(request: Request, { params }: Params) {
  const { wsId: rawWsId, eventId } = await params;
  const access = await authorizeCalendarEventManagement(request, rawWsId);
  if ('error' in access) return access.error;
  const body = LinkSchema.safeParse(
    (await request.json().catch(() => null)) ?? {}
  );
  if (!z.guid().safeParse(eventId).success || !body.success)
    return NextResponse.json(
      { error: 'Invalid meeting link request' },
      { status: 400, headers: NO_STORE }
    );

  const quota = await checkRateLimit(
    `calendar:event-meet:user:${access.userId}`,
    { windowMs: 60_000, maxRequests: 10 }
  );
  if (!('allowed' in quota)) return quota;

  try {
    const result = await linkEventMeeting(access.sbAdmin, {
      wsId: access.wsId,
      eventId,
      actorUserId: access.userId,
      meetingId: body.data.meetingId,
      decrypt: eventDecryptor(access.wsId),
    });
    return NextResponse.json(result, {
      status: result.created ? 201 : 200,
      headers: NO_STORE,
    });
  } catch (error) {
    return invitationErrorResponse(error, 'link meeting');
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { wsId: rawWsId, eventId } = await params;
  const access = await authorizeCalendarEventManagement(request, rawWsId);
  if ('error' in access) return access.error;
  if (!z.guid().safeParse(eventId).success)
    return NextResponse.json(
      { error: 'Invalid event ID' },
      { status: 400, headers: NO_STORE }
    );
  try {
    await unlinkEventMeeting(access.sbAdmin, { wsId: access.wsId, eventId });
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  } catch (error) {
    return invitationErrorResponse(error, 'unlink meeting');
  }
}
