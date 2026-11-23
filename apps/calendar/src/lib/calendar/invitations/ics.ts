/**
 * RFC 5545 / RFC 5546 (iTIP) calendar objects for Tuturuuu event invitations.
 *
 * Pure and framework-free: callers pass server-built event data, never
 * client-supplied text that has not been read back from storage.
 */

export type IcsMethod = 'REQUEST' | 'CANCEL';
export type IcsPartStat =
  | 'NEEDS-ACTION'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'TENTATIVE';

export interface IcsPerson {
  email: string;
  name?: string | null;
}

export interface IcsAttendee extends IcsPerson {
  partStat: IcsPartStat;
  optional?: boolean;
}

export interface IcsEvent {
  uid: string;
  sequence: number;
  method: IcsMethod;
  summary: string;
  description?: string | null;
  location?: string | null;
  conferenceUrl?: string | null;
  url?: string | null;
  start: Date;
  end: Date;
  allDay?: boolean;
  organizer: IcsPerson;
  attendees: IcsAttendee[];
  /** When the change was made; defaults to now. */
  stamp?: Date;
}

const PRODID = '-//Tuturuuu//Tuturuuu Calendar//EN';
const CRLF = '\r\n';

/** Escape a TEXT value (RFC 5545 §3.3.11). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Quote a parameter value; strip characters a quoted param cannot hold. */
function quoteParam(value: string): string {
  const cleaned = value.replace(/[\r\n"\u0000-\u001f]/g, ' ').trim();
  return `"${cleaned}"`;
}

function mailto(email: string): string {
  // Emails are validated upstream; drop anything that could break the line.
  return `mailto:${email.replace(/[\s;:,"<>]/g, '')}`;
}

const encoder = new TextEncoder();

/** Fold a content line to at most 75 octets (RFC 5545 §3.1), UTF-8 safe. */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  let limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (currentBytes + size > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
      limit = 74; // continuation lines start with one space
    }
    current += char;
    currentBytes += size;
  }
  if (current) parts.push(current);
  return parts.join(`${CRLF} `);
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, '0');
}

export function formatIcsUtc(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(
    date.getUTCDate()
  )}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(
    date.getUTCSeconds()
  )}Z`;
}

function formatIcsDate(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(
    date.getUTCDate()
  )}`;
}

function personParams(person: IcsPerson): string {
  return person.name?.trim() ? `;CN=${quoteParam(person.name.trim())}` : '';
}

export function buildInvitationIcs(event: IcsEvent): string {
  if (!(event.end.getTime() > event.start.getTime())) {
    throw new Error('Invitation end must be after its start');
  }
  const cancelled = event.method === 'CANCEL';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    `PRODID:${PRODID}`,
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `METHOD:${event.method}`,
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(event.uid)}`,
    `DTSTAMP:${formatIcsUtc(event.stamp ?? new Date())}`,
    `SEQUENCE:${Math.max(0, Math.trunc(event.sequence))}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
  ];

  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(event.start)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcsDate(event.end)}`);
  } else {
    lines.push(`DTSTART:${formatIcsUtc(event.start)}`);
    lines.push(`DTEND:${formatIcsUtc(event.end)}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(event.summary || '(No title)')}`);

  const description = [event.description?.trim(), event.conferenceUrl]
    .filter(Boolean)
    .join('\n\n');
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);

  const location = event.location?.trim() || event.conferenceUrl;
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  if (event.conferenceUrl) {
    // RFC 7986 CONFERENCE property, understood by modern clients.
    lines.push(
      `CONFERENCE;VALUE=URI;FEATURE=AUDIO,VIDEO;LABEL=${quoteParam(
        'Tuturuuu Meet'
      )}:${event.conferenceUrl}`
    );
    lines.push(`X-GOOGLE-CONFERENCE:${event.conferenceUrl}`);
  }

  lines.push(
    `ORGANIZER${personParams(event.organizer)}:${mailto(event.organizer.email)}`
  );
  for (const attendee of event.attendees) {
    const role = attendee.optional ? 'OPT-PARTICIPANT' : 'REQ-PARTICIPANT';
    lines.push(
      `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=${role};PARTSTAT=${attendee.partStat};RSVP=${
        attendee.partStat === 'NEEDS-ACTION' ? 'TRUE' : 'FALSE'
      }${personParams(attendee)}:${mailto(attendee.email)}`
    );
  }

  lines.push('TRANSP:OPAQUE', 'END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}

export function rsvpStatusToPartStat(
  status: 'pending' | 'accepted' | 'declined' | 'tentative'
): IcsPartStat {
  switch (status) {
    case 'accepted':
      return 'ACCEPTED';
    case 'declined':
      return 'DECLINED';
    case 'tentative':
      return 'TENTATIVE';
    default:
      return 'NEEDS-ACTION';
  }
}
