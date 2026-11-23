import { describe, expect, it } from 'vitest';
import {
  buildInvitationIcs,
  escapeIcsText,
  foldIcsLine,
  rsvpStatusToPartStat,
} from './ics';

const base = {
  uid: 'evt-1@calendar.tuturuuu.com',
  sequence: 2,
  method: 'REQUEST' as const,
  summary: 'Planning; Q1, roadmap',
  description: 'Line one\nLine two',
  location: null,
  conferenceUrl: 'https://tuturuuu.com/meet/ws/meetings/m1',
  start: new Date('2026-12-01T09:00:00Z'),
  end: new Date('2026-12-01T10:00:00Z'),
  organizer: { email: 'owner@example.com', name: 'Owner "Boss"' },
  attendees: [
    { email: 'a@example.com', name: 'A', partStat: 'NEEDS-ACTION' as const },
    {
      email: 'b@example.com',
      partStat: 'ACCEPTED' as const,
      optional: true,
    },
  ],
  stamp: new Date('2026-11-23T00:00:00Z'),
};

describe('buildInvitationIcs', () => {
  it('builds an RFC 5546 REQUEST with CRLF lines and escaped text', () => {
    const raw = buildInvitationIcs(base);
    expect(raw.endsWith('\r\n')).toBe(true);
    // Compare unfolded content lines (RFC 5545 §3.1).
    const ics = raw.replace(/\r\n /g, '');
    expect(ics.split('\r\n')).toEqual(
      expect.arrayContaining([
        'METHOD:REQUEST',
        'UID:evt-1@calendar.tuturuuu.com',
        'SEQUENCE:2',
        'STATUS:CONFIRMED',
        'DTSTART:20261201T090000Z',
        'DTEND:20261201T100000Z',
        'DTSTAMP:20261123T000000Z',
        'SUMMARY:Planning\\; Q1\\, roadmap',
        'LOCATION:https://tuturuuu.com/meet/ws/meetings/m1',
      ])
    );
    expect(ics).toContain(
      'ORGANIZER;CN="Owner  Boss":mailto:owner@example.com'
    );
    expect(ics).toContain(
      'ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="A":mailto:a@example.com'
    );
    expect(ics).toContain(
      'ROLE=OPT-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:b@example.com'
    );
    expect(ics).toContain(
      'CONFERENCE;VALUE=URI;FEATURE=AUDIO,VIDEO;LABEL="Tuturuuu Meet":https://tuturuuu.com/meet/ws/meetings/m1'
    );
  });

  it('marks cancellations', () => {
    const ics = buildInvitationIcs({ ...base, method: 'CANCEL' });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
  });

  it('uses DATE values for all-day events', () => {
    const ics = buildInvitationIcs({
      ...base,
      allDay: true,
      start: new Date('2026-12-01T00:00:00Z'),
      end: new Date('2026-12-02T00:00:00Z'),
    });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261201');
    expect(ics).toContain('DTEND;VALUE=DATE:20261202');
  });

  it('rejects an end before the start', () => {
    expect(() =>
      buildInvitationIcs({ ...base, end: new Date('2026-12-01T08:00:00Z') })
    ).toThrow();
  });

  it('cannot be broken by injected line breaks or properties', () => {
    const ics = buildInvitationIcs({
      ...base,
      summary: 'Hi\r\nATTENDEE:mailto:evil@example.com',
      attendees: [
        { email: 'x@example.com\r\nBCC:y', partStat: 'NEEDS-ACTION' },
      ],
    });
    const lines = ics.split('\r\n');
    expect(lines.filter((line) => line.startsWith('ATTENDEE'))).toHaveLength(1);
    expect(lines.some((line) => line.startsWith('BCC'))).toBe(false);
  });
});

describe('ics helpers', () => {
  it('escapes TEXT values', () => {
    expect(escapeIcsText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
  });

  it('folds long lines at 75 octets without splitting UTF-8 characters', () => {
    const folded = foldIcsLine(`SUMMARY:${'Tiếng Việt '.repeat(20)}`);
    const encoder = new TextEncoder();
    for (const [index, part] of folded.split('\r\n').entries()) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
      if (index > 0) expect(part.startsWith(' ')).toBe(true);
    }
    expect(folded.replace(/\r\n /g, '')).toBe(
      `SUMMARY:${'Tiếng Việt '.repeat(20)}`
    );
  });

  it('maps RSVP states to PARTSTAT', () => {
    expect(rsvpStatusToPartStat('pending')).toBe('NEEDS-ACTION');
    expect(rsvpStatusToPartStat('tentative')).toBe('TENTATIVE');
  });
});
