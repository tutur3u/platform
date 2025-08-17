import { useCallback } from 'react';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

// Extend dayjs with timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Shared timezone utility hook for calendar components
 * Provides consistent timezone handling across the application
 */
export function useTimezone(timezoneSetting?: string) {
  const toTz = useCallback(
    (d: string | Date) => {
      return !timezoneSetting || timezoneSetting === 'auto' 
        ? dayjs(d) 
        : dayjs(d).tz(timezoneSetting);
    },
    [timezoneSetting]
  );

  return { toTz };
}
