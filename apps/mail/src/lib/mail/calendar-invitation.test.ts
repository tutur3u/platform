import { describe, expect, it } from 'vitest';
import {
  calendarReply,
  decodeCalendarSource,
  parseCalendarInvitation,
} from './calendar-invitation';

// Synthetic fixtures model provider wire shapes, without live meeting identifiers.
const googleRequest = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'VERSION:2.0',
  'CALSCALE:GREGORIAN',
  'METHOD:REQUEST',
  'BEGIN:VEVENT',
  'UID:synthetic-uid@google.com',
  'SEQUENCE:2',
  'DTSTAMP:20260930T120000Z',
  'DTSTART:20261002T063000Z',
  'DTEND:20261002T080000Z',
  'ORGANIZER;CN=Google Host:mailto:host@example.test',
  'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="Unicode\u00a0Guest":mailto:guest@example.test',
  'ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:other@example.test',
  'SUMMARY:Supervisors, meeting',
  'LOCATION:SGS Campus',
  'DESCRIPTION:Join https://meet.google.com/abc-defg-hij\\nDo not forward',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

describe('actionable calendar requests', () => {
  it('recognizes a Google request with exact invited mailbox, location and join URL', () => {
    expect(
      parseCalendarInvitation(googleRequest, 'GUEST@example.test')
    ).toMatchObject({
      uid: 'synthetic-uid@google.com',
      sequence: 2,
      attendee: 'guest@example.test',
      organizer: 'host@example.test',
      location: 'SGS Campus',
      joinUrl: 'https://meet.google.com/abc-defg-hij',
    });
  });
  it.each(['ACCEPTED', 'DECLINED', 'TENTATIVE'] as const)(
    'generates a %s REPLY retaining UID and sequence without other guests',
    (response) => {
      const reply = calendarReply(
        parseCalendarInvitation(googleRequest, 'guest@example.test')!,
        response,
        new Date('2026-09-30T12:00:00Z')
      );
      expect(reply).toContain('METHOD:REPLY\r\n');
      expect(reply).toContain('UID:synthetic-uid@google.com\r\nSEQUENCE:2');
      expect(reply).toContain(
        `ATTENDEE;PARTSTAT=${response}:mailto:guest@example.test`
      );
      expect(reply).not.toContain('other@example.test');
      expect(reply).not.toContain('DESCRIPTION');
    }
  );
  it('recognizes Outlook Windows TZID and preserves original location separately from Teams', () => {
    const source = googleRequest
      .replace(
        'DTSTART:20261002T063000Z',
        'DTSTART;TZID=SE Asia Standard Time:20261002T133000'
      )
      .replace(
        'SGS Campus',
        'Original Outlook meeting room (Melbourne, Victoria, AU)'
      )
      .replace(
        'https://meet.google.com/abc-defg-hij',
        'https://teams.microsoft.com/meet/synthetic?context=test'
      );
    expect(parseCalendarInvitation(source, 'guest@example.test')).toMatchObject(
      {
        when: '2026-10-02 13:30 (SE Asia Standard Time)',
        location: 'Original Outlook meeting room (Melbourne, Victoria, AU)',
        joinUrl: 'https://teams.microsoft.com/meet/synthetic?context=test',
      }
    );
  });
  it('preserves recurrence occurrence identity without importing series or changing organizer', () => {
    const source = googleRequest.replace(
      'SEQUENCE:2',
      'SEQUENCE:2\r\nRECURRENCE-ID;TZID=Asia/Ho_Chi_Minh:20261002T133000'
    );
    const reply = calendarReply(
      parseCalendarInvitation(source, 'guest@example.test')!,
      'TENTATIVE'
    );
    expect(reply).toContain(
      'RECURRENCE-ID;TZID=Asia/Ho_Chi_Minh:20261002T133000'
    );
  });
  it.each(['PUBLISH', 'CANCEL', 'REPLY'])(
    'keeps METHOD:%s as ordinary calendar content',
    (method) => {
      expect(
        parseCalendarInvitation(
          googleRequest.replace('METHOD:REQUEST', `METHOD:${method}`),
          'guest@example.test'
        )
      ).toBeNull();
    }
  );
  it('refuses uninvited mailbox, duplicate identities, delegation and non-participants', () => {
    expect(
      parseCalendarInvitation(googleRequest, 'viewer@example.test')
    ).toBeNull();
    for (const extra of [
      ';SENT-BY="mailto:delegate@example.test"',
      ';DELEGATED-TO="mailto:delegate@example.test"',
      ';ROLE=NON-PARTICIPANT',
      ';RSVP=FALSE',
    ]) {
      expect(
        parseCalendarInvitation(
          googleRequest.replace('ATTENDEE;CUTYPE', `ATTENDEE${extra};CUTYPE`),
          'guest@example.test'
        )
      ).toBeNull();
    }
    expect(
      parseCalendarInvitation(
        googleRequest.replace(
          'END:VEVENT',
          'ATTENDEE:mailto:guest@example.test\r\nEND:VEVENT'
        ),
        'guest@example.test'
      )
    ).toBeNull();
  });
  it('rejects cancelled status, multiple events and oversized/malformed requests', () => {
    for (const source of [
      googleRequest.replace('END:VEVENT', 'STATUS:CANCELLED\r\nEND:VEVENT'),
      googleRequest.replace(
        'END:VCALENDAR',
        'BEGIN:VEVENT\r\nUID:other\r\nEND:VEVENT\r\nEND:VCALENDAR'
      ),
      googleRequest + 'x'.repeat(256 * 1024),
      googleRequest.replace('SEQUENCE:2', 'SEQUENCE:bad'),
    ])
      expect(parseCalendarInvitation(source, 'guest@example.test')).toBeNull();
  });
  it('recovers historical decimal byte text only when valid byte values are present', () => {
    const bytes = new TextEncoder().encode(googleRequest);
    expect(
      decodeCalendarSource(new TextEncoder().encode(bytes.toString()))
    ).toBe(googleRequest);
    expect(
      decodeCalendarSource(new TextEncoder().encode('66,999,71'))
    ).toBeNull();
  });
  it('folds long Unicode UID at octet boundaries and never accepts a lookalike join host', () => {
    const source = googleRequest
      .replace('synthetic-uid@google.com', `${'ü'.repeat(100)}@example.test`)
      .replace('meet.google.com/', 'meet.google.com.evil.test/');
    const parsed = parseCalendarInvitation(source, 'guest@example.test')!;
    expect(parsed.joinUrl).toBeNull();
    for (const line of calendarReply(parsed, 'ACCEPTED').split('\r\n'))
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });
});
