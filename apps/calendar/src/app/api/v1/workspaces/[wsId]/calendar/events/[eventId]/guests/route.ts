import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AddGuestsSchema,
  addEventGuests,
  getEventInvitation,
  InvitationSettingsPatchSchema,
  updateInvitationSettings,
} from '@/lib/calendar/invitations/guests';
import {
  eventDecryptor,
  invitationDeps,
  invitationErrorResponse,
  NO_STORE,
} from '@/lib/calendar/invitations/route-support';
import { authorizeCalendarEventManagement } from '@/lib/calendar-event-permission';
import { checkRateLimit } from '@/lib/rate-limit';

type Params = { params: Promise<{ wsId: string; eventId: string }> };

function invalid(message: string) {
  return NextResponse.json(
    { error: message },
    { status: 400, headers: NO_STORE }
  );
}

export async function GET(request: Request, { params }: Params) {
  await connection();
  const { wsId: rawWsId, eventId } = await params;
  const access = await authorizeCalendarEventManagement(request, rawWsId);
  if ('error' in access) return access.error;
  if (!z.guid().safeParse(eventId).success) return invalid('Invalid event ID');
  try {
    const { settings, guests, links, native } = await getEventInvitation(
      access.sbAdmin,
      {
        wsId: access.wsId,
        eventId,
      }
    );
    return NextResponse.json(
      {
        native,
        links,
        settings: settings
          ? {
              guestsCanModify: settings.guests_can_modify,
              guestsCanInviteOthers: settings.guests_can_invite_others,
              guestsCanSeeGuestList: settings.guests_can_see_guest_list,
              meetMeetingId: settings.meet_meeting_id,
              conferenceUrl: settings.conference_url,
              cancelled: settings.cancelled_at !== null,
            }
          : null,
        guests: guests.map((guest) => ({
          id: guest.id,
          email: guest.email,
          displayName: guest.display_name,
          userId: guest.user_id,
          contactId: guest.contact_id,
          source: guest.source,
          isOrganizer: guest.is_organizer,
          isOptional: guest.is_optional,
          rsvpStatus: guest.rsvp_status,
          respondedAt: guest.responded_at,
          invited: guest.last_invited_sequence !== null,
        })),
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    return invitationErrorResponse(error, 'list guests');
  }
}

export async function POST(request: Request, { params }: Params) {
  const { wsId: rawWsId, eventId } = await params;
  const access = await authorizeCalendarEventManagement(request, rawWsId);
  if ('error' in access) return access.error;
  if (!z.guid().safeParse(eventId).success) return invalid('Invalid event ID');
  const body = AddGuestsSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!body.success) return invalid('Invalid guests');

  const quota = await checkRateLimit(
    `calendar:guests:add:user:${access.userId}`,
    { windowMs: 60_000, maxRequests: 20 }
  );
  if (!('allowed' in quota)) return quota;

  try {
    const result = await addEventGuests(
      invitationDeps(access.sbAdmin, request),
      {
        wsId: access.wsId,
        eventId,
        actorUserId: access.userId,
        body: body.data,
        decrypt: eventDecryptor(access.wsId),
      }
    );
    return NextResponse.json(
      {
        added: result.added.length,
        delivery: result.delivery,
      },
      { status: 201, headers: NO_STORE }
    );
  } catch (error) {
    return invitationErrorResponse(error, 'add guests');
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { wsId: rawWsId, eventId } = await params;
  const access = await authorizeCalendarEventManagement(request, rawWsId);
  if ('error' in access) return access.error;
  if (!z.guid().safeParse(eventId).success) return invalid('Invalid event ID');
  const body = InvitationSettingsPatchSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!body.success || !Object.keys(body.data).length)
    return invalid('Invalid guest settings');
  try {
    const settings = await updateInvitationSettings(access.sbAdmin, {
      wsId: access.wsId,
      eventId,
      actorUserId: access.userId,
      patch: body.data,
    });
    return NextResponse.json(
      {
        guestsCanModify: settings.guests_can_modify,
        guestsCanInviteOthers: settings.guests_can_invite_others,
        guestsCanSeeGuestList: settings.guests_can_see_guest_list,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    return invitationErrorResponse(error, 'update guest settings');
  }
}
