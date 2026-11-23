import { z } from 'zod';

export const GuestRsvpStatusSchema = z.enum([
  'pending',
  'accepted',
  'declined',
  'tentative',
]);
export type GuestRsvpStatus = z.infer<typeof GuestRsvpStatusSchema>;

export const InvitationKindSchema = z.enum(['invite', 'update', 'cancel']);
export type InvitationKind = z.infer<typeof InvitationKindSchema>;

/**
 * Server-built copy of an event at the moment an invitation was queued.
 * Stored in calendar_invite_deliveries.event_snapshot and rendered by the
 * dispatcher, so a cancellation still renders after the event is deleted.
 */
export const InvitationSnapshotSchema = z.object({
  v: z.literal(1),
  eventId: z.guid(),
  wsId: z.guid(),
  uid: z.string().min(1).max(255),
  sequence: z.number().int().min(0),
  title: z.string().max(1024),
  description: z.string().max(8000).nullable(),
  location: z.string().max(1000).nullable(),
  conferenceUrl: z.string().url().max(2048).nullable(),
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
  allDay: z.boolean(),
  timeZone: z.string().max(100).nullable(),
  organizer: z.object({
    email: z.email(),
    name: z.string().max(200).nullable(),
    userId: z.guid().nullable(),
  }),
  guestsCanSeeGuestList: z.boolean(),
  attendees: z
    .array(
      z.object({
        email: z.email(),
        name: z.string().max(200).nullable(),
        status: GuestRsvpStatusSchema,
        optional: z.boolean(),
      })
    )
    .max(101),
});
export type InvitationSnapshot = z.infer<typeof InvitationSnapshotSchema>;

export function deliveryIdempotencyKey(input: {
  eventId: string;
  recipientEmail: string;
  sequence: number;
  kind: InvitationKind;
}) {
  return [
    'cal-invite-v1',
    input.eventId,
    input.recipientEmail,
    input.sequence,
    input.kind,
  ].join(':');
}

/** The attendees a given recipient may see in their copy. */
export function attendeesVisibleTo(
  snapshot: InvitationSnapshot,
  recipientEmail: string
) {
  if (snapshot.guestsCanSeeGuestList) return snapshot.attendees;
  return snapshot.attendees.filter(
    (attendee) =>
      attendee.email === recipientEmail ||
      attendee.email === snapshot.organizer.email
  );
}
