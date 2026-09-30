import { MAX_SHORT_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import { z } from 'zod';

/** Store supported IANA names or inheritance without accepting offset strings. */
export const calendarTimezoneSchema = z
  .string()
  .max(MAX_SHORT_TEXT_LENGTH)
  .refine(
    (value) => {
      if (value === 'auto') return true;
      if (!/^[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)*$/.test(value))
        return false;
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Expected a supported IANA timezone or auto' }
  );
