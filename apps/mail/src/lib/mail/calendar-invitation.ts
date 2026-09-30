export type CalendarResponse = 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';

type Property = {
  name: string;
  params: Record<string, string>;
  value: string;
  line: string;
};
export type CalendarInvitation = {
  uid: string;
  sequence: number;
  organizer: string;
  attendee: string;
  summary: string;
  start: string;
  when: string;
  recurrence: string | null;
  location: string;
  joinUrl: string | null;
};

export function decodeCalendarSource(bytes: Uint8Array) {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim();
  // Recover historical text-encoder coercion of typed arrays without rewriting storage.
  if (!/^(?:\d{1,3},)*\d{1,3}$/u.test(source)) return source;
  const values = source.split(',').map(Number);
  if (values.some((value) => value > 255) || values.length > 256 * 1024)
    return null;
  return new TextDecoder('utf-8', { fatal: true }).decode(
    Uint8Array.from(values)
  );
}

// Calendar scheduling is deliberately stricter than calendar attachment preview.
// Ambiguous identities, multiple events and unsupported delegation stay files.
function property(line: string): Property | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    if (line[i] === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 1 || quoted) return null;
  const parts = line.slice(0, colon).split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/u);
  const name = parts.shift()!.toUpperCase();
  const params: Record<string, string> = {};
  for (const part of parts) {
    const equals = part.indexOf('=');
    if (equals < 1) return null;
    const key = part.slice(0, equals).toUpperCase();
    if (key in params) return null;
    params[key] = part.slice(equals + 1).replace(/^"|"$/gu, '');
  }
  return { name, params, value: line.slice(colon + 1), line };
}

function address(value: string) {
  const match = /^mailto:([^\s<>;,"\\]+@[^\s<>;,"\\]+)$/iu.exec(value);
  return match?.[1]?.toLowerCase() ?? null;
}

export function parseCalendarInvitation(
  source: string,
  mailboxAddress: string
): CalendarInvitation | null {
  if (
    Buffer.byteLength(source, 'utf8') > 256 * 1024 ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject unsafe ICS control bytes.
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(source)
  )
    return null;
  const lines = source
    .replace(/\r?\n[ \t]/gu, '')
    .split(/\r?\n/u)
    .filter(Boolean);
  if (lines[0] !== 'BEGIN:VCALENDAR' || lines.at(-1) !== 'END:VCALENDAR')
    return null;
  const stack: string[] = [];
  const calendar: Property[] = [];
  const event: Property[] = [];
  let events = 0;
  for (const line of lines) {
    const parsed = property(line);
    if (!parsed) return null;
    if (parsed.name === 'BEGIN') {
      if (parsed.value === 'VEVENT' && stack.join('/') === 'VCALENDAR')
        events++;
      else if (parsed.value === 'VEVENT') return null;
      stack.push(parsed.value);
    } else if (parsed.name === 'END') {
      if (stack.pop() !== parsed.value) return null;
    } else if (stack.join('/') === 'VCALENDAR') calendar.push(parsed);
    else if (stack.join('/') === 'VCALENDAR/VEVENT') event.push(parsed);
  }
  if (stack.length || events !== 1) return null;
  const single = (rows: Property[], name: string) => {
    const values = rows.filter((row) => row.name === name);
    return values.length === 1 ? values[0] : null;
  };
  if (
    single(calendar, 'METHOD')?.value !== 'REQUEST' ||
    single(calendar, 'VERSION')?.value !== '2.0'
  )
    return null;
  const uid = single(event, 'UID')?.value;
  const organizerProperty = single(event, 'ORGANIZER');
  const organizer = organizerProperty && address(organizerProperty.value);
  const start = single(event, 'DTSTART')?.value;
  const stamp = single(event, 'DTSTAMP')?.value;
  const attendeeRows = event.filter(
    (row) =>
      row.name === 'ATTENDEE' &&
      address(row.value) === mailboxAddress.toLowerCase()
  );
  const attendee = attendeeRows.length === 1 ? attendeeRows[0] : null;
  const sequences = event.filter((row) => row.name === 'SEQUENCE');
  const sequence =
    sequences.length === 0
      ? 0
      : sequences.length === 1 && /^\d{1,9}$/u.test(sequences[0]!.value)
        ? Number(sequences[0]!.value)
        : null;
  const recurrences = event.filter((row) => row.name === 'RECURRENCE-ID');
  if (
    !uid ||
    !organizer ||
    !start ||
    !stamp ||
    !attendee ||
    sequence === null ||
    recurrences.length > 1 ||
    organizer === mailboxAddress.toLowerCase() ||
    organizerProperty?.params['SENT-BY'] ||
    attendee.params['SENT-BY'] ||
    attendee.params['DELEGATED-TO'] ||
    attendee.params['DELEGATED-FROM'] ||
    attendee.params.ROLE === 'NON-PARTICIPANT' ||
    attendee.params.RSVP === 'FALSE' ||
    event.some((row) => row.name === 'STATUS' && row.value === 'CANCELLED')
  )
    return null;
  if (!/^\d{8}(T\d{6}Z?)?$/u.test(start) || !/^\d{8}T\d{6}Z$/u.test(stamp))
    return null;
  const location =
    single(event, 'LOCATION')
      ?.value.replace(/\\[nN]/gu, '\n')
      .replace(/\\([,;\\])/gu, '$1') ?? '';
  const description = single(event, 'DESCRIPTION')?.value ?? '';
  const links =
    [single(event, 'URL')?.value ?? '', location, description]
      .join(' ')
      .match(/https:\/\/[^\s<>"\\]+/gu) ?? [];
  const joinUrl =
    links.find((value) => {
      try {
        const url = new URL(value);
        return (
          url.hostname === 'meet.google.com' ||
          url.hostname === 'teams.microsoft.com' ||
          url.hostname === 'teams.live.com'
        );
      } catch {
        return false;
      }
    }) ?? null;
  return {
    uid,
    sequence,
    organizer,
    attendee: mailboxAddress.toLowerCase(),
    summary:
      single(event, 'SUMMARY')
        ?.value.replace(/\\[nN]/gu, '\n')
        .replace(/\\([,;\\])/gu, '$1') ?? '',
    start,
    when: `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}${start.includes('T') ? ` ${start.slice(9, 11)}:${start.slice(11, 13)}` : ''}${start.endsWith('Z') ? ' UTC' : single(event, 'DTSTART')?.params.TZID ? ` (${single(event, 'DTSTART')!.params.TZID})` : ''}`,
    recurrence: recurrences[0]?.line ?? null,
    location,
    joinUrl,
  };
}

export function calendarReply(
  invitation: CalendarInvitation,
  response: CalendarResponse,
  now = new Date()
) {
  const stamp = now
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, 'Z');
  // Emit only the replying attendee. Never echo descriptions, alarms or other guests.
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tuturuuu//Mail//EN',
    'METHOD:REPLY',
    'BEGIN:VEVENT',
    `UID:${invitation.uid}`,
    `SEQUENCE:${invitation.sequence}`,
    `DTSTAMP:${stamp}`,
    `ORGANIZER:mailto:${invitation.organizer}`,
    `ATTENDEE;PARTSTAT=${response}:mailto:${invitation.attendee}`,
    ...(invitation.recurrence ? [invitation.recurrence] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  // RFC 5545 folds at 75 octets, preserving Unicode code points.
  const folded = lines
    .map((line) => {
      let folded = '';
      let width = 0;
      for (const character of line) {
        const bytes = Buffer.byteLength(character);
        if (width + bytes > 75) {
          folded += '\r\n ';
          width = 1;
        }
        folded += character;
        width += bytes;
      }
      return folded;
    })
    .join('\r\n');
  return `${folded}\r\n`;
}
