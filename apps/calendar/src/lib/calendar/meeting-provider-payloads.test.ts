import { describe, expect, it } from 'vitest';
import {
  googleMeetingGuests,
  microsoftMeetingGuests,
  microsoftUtcDateTime,
} from './meeting-provider-payloads';

const invitation = {
  guests: [{ email: 'person@example.com', name: 'Person', optional: true }],
  timeZone: 'Asia/Ho_Chi_Minh',
};

describe('provider invitation payloads', () => {
  it('requests Google RSVP without pre-accepting on behalf of guests', () => {
    expect(googleMeetingGuests(invitation)).toEqual({
      attendees: [
        { email: 'person@example.com', displayName: 'Person', optional: true },
      ],
    });
  });
  it('requests Outlook RSVP with equivalent optional guest semantics', () => {
    expect(microsoftMeetingGuests(invitation)).toEqual({
      responseRequested: true,
      attendees: [
        {
          emailAddress: { address: 'person@example.com', name: 'Person' },
          type: 'optional',
        },
      ],
    });
  });
  it('omits attendees on edits that do not modify guest lists', () => {
    expect(googleMeetingGuests()).toEqual({});
    expect(microsoftMeetingGuests()).toEqual({});
  });
  it.each([
    ['2026-09-21T09:00:00+07:00', '2026-09-21T02:00:00.000'],
    ['2026-11-01T01:30:00-04:00', '2026-11-01T05:30:00.000'],
    ['2026-11-01T01:30:00-05:00', '2026-11-01T06:30:00.000'],
  ])(
    'preserves the instant across offsets and DST ambiguity: %s',
    (input, expected) => {
      expect(microsoftUtcDateTime(input)).toEqual({
        dateTime: expected,
        timeZone: 'UTC',
      });
    }
  );
});
