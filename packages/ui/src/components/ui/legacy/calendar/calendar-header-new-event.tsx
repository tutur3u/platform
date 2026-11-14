'use client';

import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { createContext, useCallback, useContext } from 'react';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useCalendarSettings } from './settings/settings-context';

dayjs.extend(utc);
dayjs.extend(timezone);

const SLOT_MINUTES = 30;
const LAST_SLOT_MINUTES = 23 * 60 + SLOT_MINUTES;

/**
 * Start of a new event created from the toolbar: the next half hour after
 * `now` (wall clock in `zone`), placed on the day the calendar is showing.
 * Late-evening times clamp to 23:30 so the event stays on the viewed day.
 */
export function nextHalfHourOn(viewedDate: Date, now: Date, zone?: string) {
  const zoned = zone && zone !== 'auto';
  const wallNow = zoned ? dayjs(now).tz(zone) : dayjs(now);
  const minutes = wallNow.hour() * 60 + wallNow.minute();
  const slot = Math.min(
    (Math.floor(minutes / SLOT_MINUTES) + 1) * SLOT_MINUTES,
    LAST_SLOT_MINUTES
  );
  const hh = String(Math.floor(slot / 60)).padStart(2, '0');
  const mm = String(slot % 60).padStart(2, '0');
  const wallTime = `${dayjs(viewedDate).format('YYYY-MM-DD')}T${hh}:${mm}:00`;
  return (zoned ? dayjs.tz(wallTime, zone) : dayjs(wallTime)).toDate();
}

const CalendarHeaderDateContext = createContext<Date | null>(null);

/** Shares the header's viewed date with actions rendered in its `extras` slot. */
export const CalendarHeaderDateProvider = CalendarHeaderDateContext.Provider;

/**
 * Opens the event modal for a new plain event, using the same path as a grid
 * click (`addEmptyEvent`). Read-only calendars cannot create events.
 */
export function useCreateCalendarEvent() {
  const viewedDate = useContext(CalendarHeaderDateContext);
  const { addEmptyEvent, readOnly } = useCalendar();
  const { settings } = useCalendarSettings();
  const zone = settings?.timezone?.timezone;

  const createEvent = useCallback(() => {
    if (readOnly) return;
    const now = new Date();
    addEmptyEvent(nextHalfHourOn(viewedDate ?? now, now, zone));
  }, [addEmptyEvent, readOnly, viewedDate, zone]);

  return { createEvent, disabled: readOnly };
}
