import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);

/**
 * Check if a dayjs time is exactly midnight (00:00:00.000)
 * Used to determine if an event ending at midnight should be treated
 * as ending on the previous day for display purposes.
 *
 * @example
 * // Event: Monday 10pm - Tuesday 12am (midnight)
 * // Should only show on Monday, not also on Tuesday
 */
export const isMidnight = (d: dayjs.Dayjs): boolean =>
  d.hour() === 0 &&
  d.minute() === 0 &&
  d.second() === 0 &&
  d.millisecond() === 0;

/**
 * Get the normalized end day for an event, adjusting for midnight boundary.
 * Events ending at exactly midnight are treated as ending on the previous day.
 *
 * @param endDay - The end date/time of the event
 * @returns The normalized end day (start of day)
 */
export const getNormalizedEndDay = (endDay: dayjs.Dayjs): dayjs.Dayjs => {
  // For events ending exactly at midnight, treat them as ending on the previous day
  // e.g., an event Mon 10pm - Tue 12am should only appear on Monday
  return isMidnight(endDay)
    ? endDay.subtract(1, 'day').startOf('day')
    : endDay.startOf('day');
};

/**
 * Determine if an event spans multiple calendar days, accounting for midnight boundary.
 * An event ending at exactly midnight is NOT considered multi-day if it starts
 * on the previous day.
 *
 * @param startAt - Event start time (ISO string)
 * @param endAt - Event end time (ISO string)
 * @param tz - Timezone ('auto' or IANA timezone string)
 * @returns true if the event spans multiple days
 */
export const isMultiDayEvent = (
  startAt: string,
  endAt: string,
  tz?: string
): boolean => {
  const startDay = tz === 'auto' ? dayjs(startAt) : dayjs(startAt).tz(tz);
  const endDay = tz === 'auto' ? dayjs(endAt) : dayjs(endAt).tz(tz);

  const startDayNormalized = startDay.startOf('day');
  const endDayNormalized = getNormalizedEndDay(endDay);

  return !startDayNormalized.isSame(endDayNormalized);
};

export type DayPosition = 'start' | 'middle' | 'end';

export interface ProcessedCalendarEvent extends CalendarEvent {
  _originalId?: string;
  _isMultiDay?: boolean;
  _dayPosition?: DayPosition;
}

/**
 * Process a calendar event to handle multi-day events properly.
 * - Single-day events are returned as-is
 * - Multi-day events are split into separate instances for each day
 * - Events ending at midnight are NOT split to the next day
 *
 * @param event - The calendar event to process
 * @param tz - Timezone ('auto' or IANA timezone string)
 * @returns Array of processed events (1 for single-day, multiple for multi-day)
 */
export const processCalendarEvent = (
  event: CalendarEvent,
  tz?: string
): ProcessedCalendarEvent[] => {
  // Parse dates with proper timezone handling
  const startDay =
    tz === 'auto' ? dayjs(event.start_at) : dayjs(event.start_at).tz(tz);
  const endDay =
    tz === 'auto' ? dayjs(event.end_at) : dayjs(event.end_at).tz(tz);

  // Ensure end time is after start time
  if (endDay.isBefore(startDay)) {
    // Fix invalid event by setting end time to 1 hour after start
    return [{ ...event, end_at: startDay.add(1, 'hour').toISOString() }];
  }

  // Normalize dates to compare just the date part (ignoring time)
  const startDayNormalized = startDay.startOf('day');
  const endDayNormalized = getNormalizedEndDay(endDay);

  // If start and end are on the same day, return the original event
  if (startDayNormalized.isSame(endDayNormalized)) {
    return [
      {
        ...event,
        start_at: startDay.toISOString(),
        end_at: endDay.toISOString(),
      },
    ];
  }

  // For multi-day events, create a separate instance for each day
  const splitEvents: ProcessedCalendarEvent[] = [];
  let currentDay = startDayNormalized.clone();

  // Iterate through each day of the event
  while (currentDay.isSameOrBefore(endDayNormalized)) {
    const dayStart = currentDay.startOf('day');
    const dayEnd = currentDay.endOf('day');

    const dayEvent: ProcessedCalendarEvent = {
      ...event,
      _originalId: event.id,
      id: `${event.id}-${currentDay.format('YYYY-MM-DD')}`,
      _isMultiDay: true,
      _dayPosition: currentDay.isSame(startDayNormalized)
        ? 'start'
        : currentDay.isSame(endDayNormalized)
          ? 'end'
          : 'middle',
    };

    if (currentDay.isSame(startDayNormalized)) {
      dayEvent.start_at = startDay.toISOString();
      dayEvent.end_at = dayEnd.toISOString();
    } else if (currentDay.isSame(endDayNormalized)) {
      dayEvent.start_at = dayStart.toISOString();
      dayEvent.end_at = endDay.toISOString();
    } else {
      dayEvent.start_at = dayStart.toISOString();
      dayEvent.end_at = dayEnd.toISOString();
    }

    splitEvents.push(dayEvent);
    currentDay = currentDay.add(1, 'day');
  }

  return splitEvents;
};
