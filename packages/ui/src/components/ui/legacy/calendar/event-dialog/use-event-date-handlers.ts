'use client';

import { createAllDayEvent } from '@tuturuuu/utils/calendar-utils';
import dayjs from 'dayjs';
import ts from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { type Dispatch, type SetStateAction, useState } from 'react';
import type { CalendarEventCreationDraft } from '../../../../../hooks/calendar-event-create-payload';

dayjs.extend(ts);
dayjs.extend(utc);

/**
 * Start, end and all-day changes for the event dialog. Moving the start keeps
 * the end after it; an all-day toggle remembers the timed range (and the
 * all-day range) so switching back restores what the user had.
 */
export function useEventDateHandlers({
  tz,
  isAllDay,
  setIsAllDay,
  setEvent,
  setDateError,
}: {
  tz?: string;
  isAllDay: boolean;
  setIsAllDay: Dispatch<SetStateAction<boolean>>;
  setEvent: Dispatch<SetStateAction<CalendarEventCreationDraft>>;
  setDateError: Dispatch<SetStateAction<string | null>>;
}) {
  // Store previous time values for toggling all-day
  const [prevTimes, setPrevTimes] = useState<{
    timed: { start: string | null; end: string | null };
    allday: { start: string | null; end: string | null };
  }>({ timed: { start: null, end: null }, allday: { start: null, end: null } });

  // Handle start date change
  const handleStartDateChange = (date: Date | undefined) => {
    if (!date) return;

    setEvent((prev) => {
      const newStartDate = tz === 'auto' ? dayjs(date) : dayjs(date).tz(tz);
      const endDate =
        tz === 'auto'
          ? dayjs(prev.end_at || '')
          : dayjs(prev.end_at || '').tz(tz);
      const newEvent: CalendarEventCreationDraft = {
        ...prev,
        start_at: date.toISOString(),
      };

      if (isAllDay) {
        // For all-day, keep end_at as is if it's after or equal to start_at + 1 day, otherwise set to start + 1 day
        newEvent.start_at = newStartDate.startOf('day').toISOString();
        let newEnd = dayjs(prev.end_at).isValid()
          ? dayjs(prev.end_at)
          : newStartDate.startOf('day').add(1, 'day');
        if (!newEnd.isAfter(newStartDate.startOf('day'))) {
          newEnd = newStartDate.startOf('day').add(1, 'day');
        }
        newEvent.end_at = newEnd.toISOString();
      } else {
        // If end time is before or equal to new start time, set end time to 1 hour after start
        if (!endDate.isAfter(newStartDate)) {
          const plusOneHour = newStartDate.add(1, 'hour');
          if (plusOneHour.date() !== newStartDate.date()) {
            newEvent.end_at = plusOneHour.toISOString();
          } else {
            newEvent.end_at = plusOneHour.toISOString();
          }
        }
      }

      // Only show error if end <= start
      if (
        dayjs(newEvent.end_at).isSame(dayjs(newEvent.start_at)) ||
        dayjs(newEvent.end_at).isBefore(dayjs(newEvent.start_at))
      ) {
        setDateError('End time must be after start time.');
      } else {
        setDateError(null);
      }
      return newEvent;
    });
  };

  // Handle end date change
  const handleEndDateChange = (date: Date | undefined) => {
    if (!date) return;

    setEvent((prev) => {
      let newEndDate = tz === 'auto' ? dayjs(date) : dayjs(date).tz(tz);
      const startDate =
        tz === 'auto'
          ? dayjs(prev.start_at || '')
          : dayjs(prev.start_at || '').tz(tz);
      const newEvent: CalendarEventCreationDraft = { ...prev };

      if (isAllDay) {
        // For all-day, set end_at to the start of the day after the selected end date
        let newEnd = newEndDate.startOf('day').add(1, 'day');
        // Ensure end is not before or equal to start
        if (!newEnd.isAfter(startDate.startOf('day'))) {
          newEnd = startDate.startOf('day').add(1, 'day');
        }
        newEvent.end_at = newEnd.toISOString();
        // Don't change start_at here
      } else {
        // If end is not after start, increment end date by one day and set the entered time
        if (!newEndDate.isAfter(startDate)) {
          // Use the time from the user's input, but increment the date by one day
          newEndDate = newEndDate.add(1, 'day');
        }
        // If end is after start, accept as is
        newEvent.end_at = newEndDate.toISOString();
      }

      if (!dayjs(newEvent.end_at).isAfter(dayjs(newEvent.start_at))) {
        setDateError('End time must be after start time.');
      } else {
        setDateError(null);
      }

      return newEvent;
    });
  };

  // Handle all-day toggle
  const handleAllDayChange = (checked: boolean) => {
    setEvent((prev) => {
      const startDate =
        tz === 'auto' ? dayjs(prev.start_at) : dayjs(prev.start_at).tz(tz);
      // Backup previous times before updating
      const timedBackup = prevTimes.timed;
      const alldayBackup = prevTimes.allday;
      if (checked) {
        setPrevTimes((old) => ({
          ...old,
          timed: { start: prev.start_at || null, end: prev.end_at || null },
        }));
        // Restore previous all-day range if it exists
        if (alldayBackup.start && alldayBackup.end) {
          return {
            ...prev,
            start_at: alldayBackup.start,
            end_at: alldayBackup.end,
          };
        }
        // Use the new createAllDayEvent helper for proper timezone handling
        const { start_at, end_at } = createAllDayEvent(
          startDate.toDate(),
          tz,
          1 // 1 day duration
        );
        return {
          ...prev,
          start_at,
          end_at,
        };
      } else {
        setPrevTimes((old) => ({
          ...old,
          allday: { start: prev.start_at || null, end: prev.end_at || null },
        }));
        // Restore previous timed range if it exists
        if (timedBackup.start && timedBackup.end) {
          return {
            ...prev,
            start_at: timedBackup.start,
            end_at: timedBackup.end,
          };
        }
        const newStart =
          tz === 'auto'
            ? dayjs().startOf('hour')
            : dayjs().startOf('hour').tz(tz);
        const newEnd = newStart.add(1, 'hour');
        return {
          ...prev,
          start_at: newStart.toISOString(),
          end_at: newEnd.toISOString(),
        };
      }
    });
    setIsAllDay((prev) => !prev);
  };

  return { handleStartDateChange, handleEndDateChange, handleAllDayChange };
}
