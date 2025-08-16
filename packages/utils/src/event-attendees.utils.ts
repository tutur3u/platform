import type { EventAttendeeStatus } from '@tuturuuu/types/primitives/RSVP';

export type EventAttendeeCount = {
  total: number;
  accepted: number;
  declined: number;
  pending: number;
  tentative: number;
};

export function calculateAttendeeCounts(
  attendees: Array<{ status: EventAttendeeStatus }> | undefined
): EventAttendeeCount {
  if (!attendees || attendees.length === 0) {
    return {
      total: 0,
      accepted: 0,
      declined: 0,
      pending: 0,
      tentative: 0,
    };
  }

  return attendees.reduce(
    (counts, attendee) => {
      // Guard against unexpected/null statuses and increment safely
      switch (attendee.status) {
        case 'accepted':
        case 'declined':
        case 'pending':
        case 'tentative':
          counts.total++;
          counts[attendee.status]++;
          break;
        default:
          // ignore unknown statuses
          break;
      }
      return counts;
    },
    { total: 0, accepted: 0, declined: 0, pending: 0, tentative: 0 }
  );
}
