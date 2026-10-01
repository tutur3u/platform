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
  timezone: string[];
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

/** Uses the same quote-aware content-line grammar as invitation validation. */
export function calendarRecurrenceIdentity(line: string | null) {
  if (!line) return null;
  const parsed = property(line);
  if (parsed?.name !== 'RECURRENCE-ID')
    throw new Error('Invalid validated recurrence property');
  return {
    value: parsed.value,
    valueType:
      parsed.params.VALUE?.toUpperCase() === 'DATE'
        ? ('DATE' as const)
        : ('DATE-TIME' as const),
    timezone: parsed.params.TZID ?? null,
  };
}

function address(value: string) {
  const match = /^mailto:([^\s<>;,"\\]+@[^\s<>;,"\\]+)$/iu.exec(value);
  return match?.[1]?.toLowerCase() ?? null;
}

function hasUnsafeControls(source: string) {
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) return true;
    if (code === 13 && source.charCodeAt(index + 1) !== 10) return true;
  }
  return false;
}

function localDateTime(value: string) {
  if (!/^\d{8}T\d{6}$/u.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    year > 0 &&
    month > 0 &&
    month <= 12 &&
    day > 0 &&
    day <= days[month - 1]! &&
    Number(value.slice(9, 11)) < 24 &&
    Number(value.slice(11, 13)) < 60 &&
    Number(value.slice(13, 15)) <= 60
  );
}

// Preserve the organizer's definition; never infer UTC from a custom/Windows ID.
function recurrenceTimezone(zones: string[][], tzid: string) {
  const matching = zones.filter((lines) =>
    lines.some(
      (line) =>
        property(line)?.name === 'TZID' && property(line)?.value === tzid
    )
  );
  if (matching.length !== 1) return null;
  const lines = matching[0]!;
  if (lines.length > 256 || Buffer.byteLength(lines.join('\r\n')) > 32 * 1024)
    return null;
  const root: Property[] = [];
  const observances: Property[][] = [];
  let current: Property[] | null = null;
  for (const line of lines.slice(1, -1)) {
    const row = property(line);
    if (!row) return null;
    if (row.name === 'BEGIN') {
      if (current || !['STANDARD', 'DAYLIGHT'].includes(row.value)) return null;
      current = [row];
    } else if (row.name === 'END') {
      if (!current || current[0]!.value !== row.value) return null;
      observances.push(current.slice(1));
      current = null;
    } else (current ?? root).push(row);
  }
  if (current || observances.length < 1 || observances.length > 8) return null;
  const ids = root.filter((row) => row.name === 'TZID');
  if (ids.length !== 1 || ids[0]!.value !== tzid) return null;
  if (
    root.some(
      (row) =>
        !['TZID', 'LAST-MODIFIED', 'TZURL'].includes(row.name) &&
        !row.name.startsWith('X-')
    )
  )
    return null;
  for (const rows of observances) {
    if (
      rows.some(
        (row) =>
          ![
            'DTSTART',
            'TZOFFSETFROM',
            'TZOFFSETTO',
            'RRULE',
            'RDATE',
            'TZNAME',
            'COMMENT',
          ].includes(row.name) && !row.name.startsWith('X-')
      )
    )
      return null;
    for (const name of ['DTSTART', 'TZOFFSETFROM', 'TZOFFSETTO']) {
      const values = rows.filter((row) => row.name === name);
      if (values.length !== 1 || Object.keys(values[0]!.params).length)
        return null;
      const value = values[0]!.value;
      if (
        name === 'DTSTART'
          ? !localDateTime(value)
          : !/^[+-](?:[01]\d|2[0-3])[0-5]\d(?:[0-5]\d)?$/u.test(value) ||
            /^-0000(?:00)?$/u.test(value)
      )
        return null;
    }
    const rules = rows.filter((row) => row.name === 'RRULE');
    if (rules.length > 1 || rules.some((row) => !validTimezoneRule(row.value)))
      return null;
    if (
      rows.some(
        (row) =>
          row.name === 'RDATE' &&
          (Object.keys(row.params).length ||
            !row.value.split(',').every(localDateTime))
      )
    )
      return null;
  }
  return lines;
}

function validTimezoneRule(value: string) {
  const keys = new Set<string>();
  for (const part of value.split(';')) {
    const assignment = part.split('=');
    if (assignment.length !== 2) return false;
    const [key, entry] = assignment;
    if (!key || !entry || keys.has(key)) return false;
    keys.add(key);
    const patterns: Record<string, RegExp> = {
      FREQ: /^YEARLY$/u,
      INTERVAL: /^[1-9]\d{0,3}$/u,
      UNTIL: /^\d{8}T\d{6}Z?$/u,
      BYMONTH: /^(?:[1-9]|1[0-2])(?:,(?:[1-9]|1[0-2]))*$/u,
      BYMONTHDAY: /^-?(?:[1-9]|[12]\d|3[01])(?:,-?(?:[1-9]|[12]\d|3[01]))*$/u,
      BYDAY:
        /^(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU)(?:,(?:[+-]?[1-5])?(?:MO|TU|WE|TH|FR|SA|SU))*$/u,
    };
    if (
      !patterns[key]?.test(entry) ||
      (key === 'UNTIL' && !localDateTime(entry.replace(/Z$/u, '')))
    )
      return false;
  }
  return keys.has('FREQ');
}

export function parseCalendarInvitation(
  source: string,
  mailboxAddress: string
): CalendarInvitation | null {
  if (
    Buffer.byteLength(source, 'utf8') > 256 * 1024 ||
    hasUnsafeControls(source)
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
  const zones: string[][] = [];
  let events = 0;
  for (const line of lines) {
    const parsed = property(line);
    if (!parsed) return null;
    if (parsed.name === 'BEGIN') {
      if (parsed.value === 'VTIMEZONE' && stack.join('/') === 'VCALENDAR')
        zones.push([]);
      if (parsed.value === 'VEVENT' && stack.join('/') === 'VCALENDAR')
        events++;
      else if (parsed.value === 'VEVENT') return null;
      stack.push(parsed.value);
    }
    if (stack.includes('VTIMEZONE')) zones.at(-1)?.push(line);
    if (parsed.name === 'END') {
      if (stack.pop() !== parsed.value) return null;
    } else if (parsed.name === 'BEGIN') continue;
    else if (stack.join('/') === 'VCALENDAR') calendar.push(parsed);
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
  const recurrence = recurrences[0];
  const timezone = recurrence?.params.TZID
    ? recurrenceTimezone(zones, recurrence.params.TZID)
    : [];
  if (
    !uid ||
    !organizer ||
    !start ||
    !stamp ||
    !attendee ||
    sequence === null ||
    recurrences.length > 1 ||
    !timezone ||
    (recurrence &&
      (!/^\d{8}(T\d{6}Z?)?$/u.test(recurrence.value) ||
        (recurrence.params.TZID && !localDateTime(recurrence.value)))) ||
    organizer === mailboxAddress.toLowerCase() ||
    organizerProperty?.params['SENT-BY'] ||
    attendee.params['SENT-BY'] ||
    attendee.params['DELEGATED-TO'] ||
    attendee.params['DELEGATED-FROM'] ||
    attendee.params.ROLE?.toUpperCase() === 'NON-PARTICIPANT' ||
    attendee.params.RSVP?.toUpperCase() === 'FALSE' ||
    (attendee.params.CUTYPE !== undefined &&
      attendee.params.CUTYPE.toUpperCase() !== 'INDIVIDUAL') ||
    event.some(
      (row) => row.name === 'STATUS' && row.value.toUpperCase() === 'CANCELLED'
    )
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
    timezone,
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
    ...invitation.timezone,
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
