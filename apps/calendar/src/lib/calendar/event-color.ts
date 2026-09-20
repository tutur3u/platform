import { SUPPORTED_COLORS } from '@tuturuuu/types/primitives/SupportedColors';
import { MAX_COLOR_LENGTH } from '@tuturuuu/utils/constants';
import { z } from 'zod';

/** Calendar color foreign keys use the canonical uppercase palette. */
export const CalendarEventColorSchema = z
  .string()
  .max(MAX_COLOR_LENGTH)
  .trim()
  .toUpperCase()
  .pipe(z.enum(SUPPORTED_COLORS));

export const DefaultCalendarEventColorSchema =
  CalendarEventColorSchema.default('BLUE');
