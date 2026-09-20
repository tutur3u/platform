import type { MeetingInvitationInput } from '@tuturuuu/utils/meeting-invitations';

export function googleMeetingGuests(invitation?: MeetingInvitationInput) {
  if (!invitation) return {};
  return {
    attendees: invitation.guests.map((guest) => ({
      email: guest.email,
      displayName: guest.name,
      optional: guest.optional ?? false,
    })),
  };
}

export function microsoftMeetingGuests(invitation?: MeetingInvitationInput) {
  if (!invitation) return {};
  return {
    attendees: invitation.guests.map((guest) => ({
      emailAddress: { address: guest.email, name: guest.name ?? guest.email },
      type: guest.optional ? 'optional' : 'required',
    })),
    responseRequested: true,
  };
}

/** Graph dateTimeTimeZone carries an unambiguous wall time plus its zone. */
export function microsoftUtcDateTime(value: string) {
  return {
    dateTime: new Date(value).toISOString().replace(/Z$/, ''),
    timeZone: 'UTC',
  };
}
