/**
 * Pure deadline helpers for teacher-assigned topic announcements.
 *
 * The send deadline is 24 hours before the session starts, where the session
 * start is the stored local `session_date` + `start_time` interpreted in the
 * workspace's fixed IANA calendar timezone. The deadline is stored on write
 * (`send_due_at`) and the delivery state is derived on read, so no sweep or
 * scheduled job is needed to mark a topic late.
 */

export const TOPIC_ANNOUNCEMENT_SEND_LEAD_MS = 24 * 60 * 60 * 1000;

export type TopicAnnouncementDeliveryState = 'late' | 'not_sent' | 'sent';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/u;

function getTimeZoneOffsetMs(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second')
  );
  return asUtc - Math.floor(timestamp / 1000) * 1000;
}

/**
 * Converts a wall-clock time in `timeZone` to a UTC epoch. Returns null for an
 * invalid date, time or timezone. Wall-clock times skipped by a DST jump
 * resolve to the instant after the jump.
 */
export function zonedWallClockToUtcMs({
  date,
  time,
  timeZone,
}: {
  date: string;
  time: string;
  timeZone: string;
}): number | null {
  const dateMatch = DATE_PATTERN.exec(date.trim());
  const timeMatch = TIME_PATTERN.exec(time.trim());
  if (!dateMatch || !timeMatch) return null;

  const [, year, month, day] = dateMatch.map(Number) as number[];
  const [, hour, minute, second = 0] = timeMatch.map((part) =>
    part === undefined ? 0 : Number(part)
  ) as number[];
  if (
    month! < 1 ||
    month! > 12 ||
    day! < 1 ||
    day! > 31 ||
    hour! > 23 ||
    minute! > 59 ||
    second > 59
  ) {
    return null;
  }

  const wallClockAsUtc = Date.UTC(
    year!,
    month! - 1,
    day!,
    hour,
    minute,
    second
  );
  const normalized = new Date(wallClockAsUtc);
  if (
    normalized.getUTCDate() !== day ||
    normalized.getUTCMonth() !== month! - 1
  ) {
    return null;
  }

  try {
    const firstOffset = getTimeZoneOffsetMs(wallClockAsUtc, timeZone);
    const firstCandidate = wallClockAsUtc - firstOffset;
    const secondOffset = getTimeZoneOffsetMs(firstCandidate, timeZone);
    if (secondOffset === firstOffset) return firstCandidate;

    const secondCandidate = wallClockAsUtc - secondOffset;
    // A wall-clock time inside a DST gap matches neither offset; keep the
    // first candidate, which lands after the jump.
    return getTimeZoneOffsetMs(secondCandidate, timeZone) === secondOffset
      ? secondCandidate
      : firstCandidate;
  } catch {
    return null;
  }
}

/**
 * `send_due_at` = session start (local date + start time in the workspace
 * timezone) minus 24 hours, as an ISO string. Null when the date, start time
 * or a fixed workspace timezone is missing or invalid.
 */
export function computeTopicAnnouncementSendDueAt({
  sessionDate,
  startTime,
  timeZone,
}: {
  sessionDate: string | null | undefined;
  startTime: string | null | undefined;
  timeZone: string | null | undefined;
}): string | null {
  if (!sessionDate || !startTime || !timeZone || timeZone === 'auto') {
    return null;
  }
  const sessionStartMs = zonedWallClockToUtcMs({
    date: sessionDate,
    time: startTime,
    timeZone,
  });
  if (sessionStartMs === null) return null;
  return new Date(
    sessionStartMs - TOPIC_ANNOUNCEMENT_SEND_LEAD_MS
  ).toISOString();
}

/**
 * Derived delivery state: sent once `sent_at` is set (resends keep the first
 * on-time result), late when unsent past `send_due_at`, otherwise not sent.
 */
export function getTopicAnnouncementDeliveryState({
  now = new Date(),
  sendDueAt,
  sentAt,
}: {
  now?: Date;
  sendDueAt: string | null | undefined;
  sentAt: string | null | undefined;
}): TopicAnnouncementDeliveryState {
  if (sentAt) return 'sent';
  if (!sendDueAt) return 'not_sent';
  const dueMs = Date.parse(sendDueAt);
  if (Number.isNaN(dueMs)) return 'not_sent';
  return now.getTime() > dueMs ? 'late' : 'not_sent';
}
