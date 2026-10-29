/** Shown in a parent message when a value cannot be worked out. */
export const TUTORING_VALUE_UNKNOWN = 'Chưa xác định';

/** The class-session fields that decide a student's official class time. */
export interface TutoringClassTimeSession {
  endTimezone?: string | null;
  endsAt: string;
  startTimezone: string;
  startsAt: string;
  status: string;
}

const WEEKDAY_LABELS = [
  'Chủ nhật',
  'thứ 2',
  'thứ 3',
  'thứ 4',
  'thứ 5',
  'thứ 6',
  'thứ 7',
];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function parseClock(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatClock(totalMinutes: number) {
  const minutes = ((totalMinutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** `15:15` for 45 minutes becomes `15:15-16:00`; the start alone if unreadable. */
export function formatTutoringTimeRange(
  startTime: string,
  durationMinutes: number
) {
  const start = parseClock(startTime);
  if (start === null) return startTime.slice(0, 5);
  return `${formatClock(start)}-${formatClock(start + durationMinutes)}`;
}

/**
 * Vietnamese weekday of a `YYYY-MM-DD` date: `thứ 2` to `thứ 7`, `Chủ nhật`;
 * "Chưa xác định" for anything that is not a real date.
 */
export function getTutoringWeekdayLabel(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return TUTORING_VALUE_UNKNOWN;
  const [year, month, day] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ];
  const value = new Date(Date.UTC(year, month - 1, day));
  // A rolled-over date such as 2026-02-31 is not a date.
  if (value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day)
    return TUTORING_VALUE_UNKNOWN;
  return WEEKDAY_LABELS[value.getUTCDay()] ?? TUTORING_VALUE_UNKNOWN;
}

/** `YYYY-MM-DD` to `DD/MM/YYYY`; anything else is returned unchanged. */
export function formatTutoringDate(date: string) {
  const [year, month, day] = date.split('-');
  if (!(year && month && day)) return date;
  return `${day}/${month}/${year}`;
}

function zonedParts(timestamp: string, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric',
    }).formatToParts(new Date(timestamp));
    const part = (type: string) =>
      parts.find((item) => item.type === type)?.value;
    return {
      date: `${part('year')}-${part('month')}-${part('day')}`,
      time: `${part('hour')}:${part('minute')}`,
    };
  } catch {
    return null;
  }
}

/**
 * The student's official class time for a tutoring date, as `HH:MM-HH:MM` in
 * the class session's own time zone. With no class that day it is the next
 * scheduled class after the tutoring time with its date appended; with none at
 * all, "Chưa xác định".
 */
export function selectTutoringClassTime(
  sessions: TutoringClassTimeSession[],
  sessionDate: string,
  startTime: string
) {
  const tutoringClock = formatClock(parseClock(startTime) ?? 0);
  const classes = sessions
    .filter((session) => session.status === 'scheduled')
    .map((session) => {
      const start = zonedParts(session.startsAt, session.startTimezone);
      const end = zonedParts(
        session.endsAt,
        session.endTimezone || session.startTimezone
      );
      if (!(start && end)) return null;
      return {
        date: start.date,
        range: `${start.time}-${end.time}`,
        sortKey: `${start.date}T${start.time}`,
      };
    })
    .filter((item) => item !== null)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const sameDay = classes.find((item) => item.date === sessionDate);
  if (sameDay) return sameDay.range;

  const tutoringKey = `${sessionDate}T${tutoringClock}`;
  const next = classes.find((item) => item.sortKey > tutoringKey);
  if (next) return `${next.range} ngày ${formatTutoringDate(next.date)}`;
  return TUTORING_VALUE_UNKNOWN;
}
