/**
 * Task date/time helpers that respect a user-configured timezone.
 * Used when creating or updating task start_date/end_date so stored UTC
 * corresponds to the intended local date and time in the user's timezone.
 */

import { Temporal } from '@js-temporal/polyfill';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { resolveAutoTimezone } from './timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Resolves timezone for task dates: 'auto' → browser, otherwise validated IANA or UTC.
 */
export function resolveTaskTimezone(timezoneSetting?: string | null): string {
  return resolveAutoTimezone(timezoneSetting);
}

/**
 * Builds a Date representing the given local date/time in the specified timezone.
 * Use this when the user selects a date and time in the UI (e.g. picker) so the
 * resulting instant is correct for that timezone.
 *
 * @param year - Full year
 * @param month - Month 1–12 (calendar month)
 * @param day - Day of month
 * @param hour - Hour 0–23
 * @param minute - Minute 0–59
 * @param tz - IANA timezone (e.g. 'America/New_York') or 'auto' for browser
 */
export function buildDateInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string
): Date {
  const resolved = resolveTaskTimezone(tz);
  // Compatible selects the earlier repeated time and advances spring gaps.
  const zoned = Temporal.ZonedDateTime.from(
    { year, month, day, hour, minute, timeZone: resolved },
    { disambiguation: 'compatible' }
  );
  return new Date(zoned.epochMilliseconds);
}

/**
 * Returns date parts (year, month, day, hour, minute) of the given instant
 * in the specified timezone. Useful for displaying a UTC date in user TZ
 * or for re-building the same instant from picker date parts.
 */
export function getDatePartsInTimezone(
  date: Date,
  tz: string
): { year: number; month: number; day: number; hour: number; minute: number } {
  const resolved = resolveTaskTimezone(tz);
  const d = dayjs(date).tz(resolved);
  return {
    year: d.year(),
    month: d.month() + 1,
    day: d.date(),
    hour: d.hour(),
    minute: d.minute(),
  };
}

/**
 * Converts a Date to UTC ISO string, treating the date's local calendar/time
 * as being in the given timezone. Use when you have a Date built from local
 * input (e.g. picker in browser local) and want to store "this date/time in
 * user's configured timezone" as UTC.
 *
 * @param date - Date (typically from a picker; its getFullYear/getMonth/etc. are in browser local)
 * @param tz - User/workspace timezone
 * @returns ISO string in UTC for storage
 */
export function dateInTimezoneToUTCISO(date: Date, tz: string): string {
  const resolved = resolveTaskTimezone(tz);
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const h = date.getHours();
  const min = date.getMinutes();
  const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
  return dayjs.tz(s, resolved).toISOString();
}

/**
 * Formats a UTC instant (Date or ISO string) in the given timezone for display.
 */
export function formatInTimezone(
  date: Date | string,
  tz: string,
  formatStr: string
): string {
  const resolved = resolveTaskTimezone(tz);
  const d = dayjs(date).tz(resolved);
  return d.format(formatStr);
}

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HAS_UTC_OFFSET = /[Zz+-]\d{2}:?\d{2}$|[Zz]$/;

/**
 * Parses a date string from the AI (e.g. "2025-02-23" or "2025-02-23T15:00:00")
 * and returns UTC ISO string. When the string has no timezone (date-only or
 * naive datetime), interprets it in the user's timezone.
 *
 * @param dateStr - ISO date or date-only YYYY-MM-DD
 * @param tz - User/workspace IANA timezone
 * @param endOfDay - If true and dateStr is date-only, use 23:59:59.999 in tz; else 00:00:00
 */
export function parseTaskDateToUTCISO(
  dateStr: string,
  tz: string,
  endOfDay: boolean
): string {
  const trimmed = dateStr.trim();
  if (HAS_UTC_OFFSET.test(trimmed)) {
    return dayjs.utc(trimmed).toISOString();
  }
  const resolved = resolveTaskTimezone(tz);
  if (DATE_ONLY_REGEX.test(trimmed)) {
    const d = dayjs.tz(trimmed, resolved);
    const anchored = endOfDay ? d.endOf('day') : d.startOf('day');
    return anchored.toISOString();
  }
  const d = dayjs.tz(trimmed, resolved);
  if (!d.isValid()) {
    return dayjs.utc(trimmed).toISOString();
  }
  return d.toISOString();
}
