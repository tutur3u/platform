import type { ConfigType } from 'dayjs';
import { dayjs } from '../lib/dayjs-setup';
import { useCallback } from 'react';

/**
 * Shared timezone utility hook for calendar components
 * Provides consistent timezone handling across the application
 */
export function useTimezone(timezoneSetting?: string) {
  const toTz = useCallback(
    (d: ConfigType) => {
      return !timezoneSetting || timezoneSetting === 'auto'
        ? dayjs(d)
        : dayjs(d).tz(timezoneSetting);
    },
    [timezoneSetting]
  );

  return { toTz };
}
