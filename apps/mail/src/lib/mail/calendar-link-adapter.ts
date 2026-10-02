import type { AuthorizedCalendarLinkTarget } from '@tuturuuu/internal-api';
import type { CalendarEventLinkPreview } from '@tuturuuu/internal-api/calendar';

/** The Calendar endpoint owns authorization; this projection cannot grant it. */
export function projectMailCalendarTarget(
  actorId: string,
  workspaceId: string,
  eventId: string,
  preview: CalendarEventLinkPreview,
  calendarOrigin?: string
): AuthorizedCalendarLinkTarget | null {
  const identity = preview.identity;
  if (
    identity.actorUserId !== actorId ||
    identity.workspaceId !== workspaceId ||
    identity.eventId !== eventId
  )
    return null;
  if (
    identity.provider !== 'tuturuuu' &&
    (!identity.accountOwnerId ||
      !identity.connectionId ||
      !identity.calendarId ||
      !identity.externalEventId ||
      !identity.sourceCalendarId)
  )
    return null;
  return {
    identity,
    title: preview.title ?? '',
    organizer: preview.organizer?.email ?? preview.organizer?.name ?? null,
    attendees: preview.attendees.flatMap((person) =>
      person.email ? [person.email] : []
    ),
    location: [
      preview.location?.displayName,
      ...Object.values(preview.location?.address ?? {}),
    ]
      .filter(Boolean)
      .join(', '),
    joinUrl: preview.joinUrl,
    start: preview.start?.value ?? '',
    end: preview.end?.value ?? '',
    accountLabel: preview.accountLabel ?? '',
    authority: preview,
    calendarUrl: calendarOrigin
      ? `${calendarOrigin.replace(/\/$/, '')}/${encodeURIComponent(identity.workspaceId)}?eventId=${encodeURIComponent(identity.eventId)}`
      : null,
  };
}
