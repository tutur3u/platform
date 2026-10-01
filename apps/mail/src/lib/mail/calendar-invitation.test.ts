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
      'SEQUENCE:2\r\nRECURRENCE-ID:20261002T063000Z'
    );
    const reply = calendarReply(
      parseCalendarInvitation(source, 'guest@example.test')!,
      'TENTATIVE'
    );
    expect(reply).toContain('RECURRENCE-ID:20261002T063000Z');
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

const outlookZone = [
  'BEGIN:VTIMEZONE',
  'TZID:SE Asia Standard Time',
  'BEGIN:STANDARD',
  'DTSTART:16010101T000000',
  'TZOFFSETFROM:+0700',
  'TZOFFSETTO:+0700',
  'TZNAME:SE Asia Standard Time',
  'END:STANDARD',
  'END:VTIMEZONE',
].join('\r\n');
const outlookOccurrence = googleRequest
  .replace('BEGIN:VEVENT', `${outlookZone}\r\nBEGIN:VEVENT`)
  .replace(
    'SEQUENCE:2',
    'SEQUENCE:2\r\nRECURRENCE-ID;TZID=SE Asia Standard Time:20261002T133000'
  );

it('round-trips the complete Outlook occurrence REPLY with the original timezone definition', () => {
  const invitation = parseCalendarInvitation(
    outlookOccurrence,
    'guest@example.test'
  )!;
  expect(invitation).not.toBeNull();
  const reply = calendarReply(
    invitation,
    'TENTATIVE',
    new Date('2026-09-30T12:00:00Z')
  );
  expect(reply).toBe(
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Tuturuuu//Mail//EN',
      'METHOD:REPLY',
      outlookZone,
      'BEGIN:VEVENT',
      'UID:synthetic-uid@google.com',
      'SEQUENCE:2',
      'DTSTAMP:20260930T120000Z',
      'ORGANIZER:mailto:host@example.test',
      'ATTENDEE;PARTSTAT=TENTATIVE:mailto:guest@example.test',
      'RECURRENCE-ID;TZID=SE Asia Standard Time:20261002T133000',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n')
  );
  expect(invitation.timezone).toEqual(outlookZone.split('\r\n'));
});
it('fails closed for missing, competing, malformed or oversized referenced timezone definitions', () => {
  for (const source of [
    outlookOccurrence.replace(`${outlookZone}\r\n`, ''),
    outlookOccurrence.replace(outlookZone, `${outlookZone}\r\n${outlookZone}`),
    outlookOccurrence.replace(
      'TZID:SE Asia Standard Time',
      'TZID:Another custom zone'
    ),
    outlookOccurrence.replace('TZOFFSETTO:+0700', 'TZOFFSETTO:+0799'),
    outlookOccurrence.replace('TZOFFSETFROM:+0700', 'TZOFFSETFROM:-0000'),
    outlookOccurrence.replace(
      'DTSTART:16010101T000000',
      'DTSTART:16010230T250000'
    ),
    outlookOccurrence.replace(
      'END:STANDARD',
      'BEGIN:VALARM\r\nEND:VALARM\r\nEND:STANDARD'
    ),
    outlookOccurrence.replace(
      'END:VTIMEZONE',
      `X-OVERSIZED:${'x'.repeat(33 * 1024)}\r\nEND:VTIMEZONE`
    ),
    outlookOccurrence.replace(
      'END:STANDARD',
      'RRULE:FREQ=YEARLY;UNKNOWN=1\r\nEND:STANDARD'
    ),
  ])
    expect(parseCalendarInvitation(source, 'guest@example.test')).toBeNull();
});
it('accepts complete yearly timezone rules and rejects extra assignment separators', () => {
  const withRule = (rule: string) =>
    outlookOccurrence.replace('END:STANDARD', `RRULE:${rule}\r\nEND:STANDARD`);
  const valid = parseCalendarInvitation(
    withRule('FREQ=YEARLY;BYMONTH=1'),
    'guest@example.test'
  )!;
  expect(valid).not.toBeNull();
  expect(calendarReply(valid, 'ACCEPTED')).toContain(
    'RRULE:FREQ=YEARLY;BYMONTH=1\r\n'
  );
  for (const rule of [
    'FREQ=YEARLY=garbage;BYMONTH=1',
    'FREQ=YEARLY;BYMONTH=1=garbage',
    'FREQ=YEARLY;BYMONTH=1=',
  ])
    expect(
      parseCalendarInvitation(withRule(rule), 'guest@example.test')
    ).toBeNull();
});
it('normalizes scheduling enum parameters and rejects group/non-individual identities', () => {
  for (const parameter of [
    'RSVP=false',
    'ROLE=non-participant',
    'CUTYPE=group',
    'CUTYPE=ROOM',
  ]) {
    const original = parameter.startsWith('RSVP')
      ? 'RSVP=TRUE'
      : parameter.startsWith('ROLE')
        ? 'ROLE=REQ-PARTICIPANT'
        : 'CUTYPE=INDIVIDUAL';
    const source = googleRequest.replace(original, parameter);
    expect(parseCalendarInvitation(source, 'guest@example.test')).toBeNull();
  }
  expect(
    parseCalendarInvitation(
      googleRequest.replace('END:VEVENT', 'STATUS:cancelled\r\nEND:VEVENT'),
      'guest@example.test'
    )
  ).toBeNull();
});
it('rejects C0 boundaries without a control-character regex and retains supported line endings', () => {
  for (let code = 0; code < 32; code++) {
    if ([9, 10, 13].includes(code)) continue;
    expect(
      parseCalendarInvitation(
        googleRequest.replace('SGS Campus', `Room${String.fromCharCode(code)}`),
        'guest@example.test'
      )
    ).toBeNull();
  }
  expect(
    parseCalendarInvitation(
      googleRequest.replace('SGS Campus', 'Room\rmalformed'),
      'guest@example.test'
    )
  ).toBeNull();
  expect(
    parseCalendarInvitation(
      googleRequest.replaceAll('\r\n', '\n'),
      'guest@example.test'
    )
  ).not.toBeNull();
});
