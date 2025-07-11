import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';

dayjs.extend(timezone);

export function isAllDayEvent(event: Pick<CalendarEvent, 'start_at' | 'end_at'>, userTimezone?: string): boolean {
  const start = dayjs(event.start_at);
  const end = dayjs(event.end_at);
  
  // Handle timezone-aware checking
  const tz = userTimezone === 'auto' ? 
    (typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined) 
    : userTimezone;
  const startInTz = tz ? start.tz(tz) : start;
  const endInTz = tz ? end.tz(tz) : end;
  
  const isStartAtMidnight = startInTz.hour() === 0 && startInTz.minute() === 0 && startInTz.second() === 0;
  const isEndAtMidnight = endInTz.hour() === 0 && endInTz.minute() === 0 && endInTz.second() === 0;
  const durationHours = endInTz.diff(startInTz, 'hour');
  const isMultipleOf24Hours = durationHours > 0 && durationHours % 24 === 0;
  
  return isStartAtMidnight && isEndAtMidnight && isMultipleOf24Hours;
}

// Helper function to convert Google Calendar all-day events to proper timezone
export function convertGoogleAllDayEvent(
  startDate: string | undefined,
  endDate: string | undefined,
  userTimezone?: string
): { start_at: string; end_at: string } {
  // Check if this is a date-only format (all-day event from Google)
  const isDateOnly = (dateStr: string) => /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  
  if (!startDate || !endDate) {
    const now = dayjs();
    return {
      start_at: now.toISOString(),
      end_at: now.add(1, 'hour').toISOString(),
    };
  }
  
  // If both are date-only (Google all-day event), convert to user's timezone midnight
  if (isDateOnly(startDate) && isDateOnly(endDate)) {
    const tz = userTimezone === 'auto' ? 
      (typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined) 
      : userTimezone;
    
    const startAtMidnight = tz 
      ? dayjs.tz(`${startDate}T00:00:00`, tz)
      : dayjs(`${startDate}T00:00:00`);
    
    const endAtMidnight = tz
      ? dayjs.tz(`${endDate}T00:00:00`, tz)
      : dayjs(`${endDate}T00:00:00`);
    
    return {
      start_at: startAtMidnight.toISOString(),
      end_at: endAtMidnight.toISOString(),
    };
  }
  
  // Otherwise, use the dates as-is (they're already dateTime format)
  return {
    start_at: startDate,
    end_at: endDate,
  };
}

// Helper to create an all-day event in user's timezone
export function createAllDayEvent(
  date: Date,
  userTimezone?: string,
  durationDays: number = 1
): { start_at: string; end_at: string } {
  const tz = userTimezone === 'auto' ? 
    (typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined) 
    : userTimezone;
  
  const startAtMidnight = tz 
    ? dayjs(date).tz(tz).startOf('day')
    : dayjs(date).startOf('day');
  
  const endAtMidnight = startAtMidnight.add(durationDays, 'day');
  
  return {
    start_at: startAtMidnight.toISOString(),
    end_at: endAtMidnight.toISOString(),
  };
} 