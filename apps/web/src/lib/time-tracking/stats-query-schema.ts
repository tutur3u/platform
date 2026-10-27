import { MAX_SHORT_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import { z } from 'zod';
import { sessionTagSchema } from './session-tags';

/** The longest stats window, in days: a year, leap day included. */
export const MAX_STATS_DAYS_BACK = 366;

/** Query parameters of the workspace time-tracker stats route. */
export const statsQuerySchema = z.object({
  userId: process.env.NODE_ENV === 'development' ? z.string() : z.guid(),
  isPersonal: z.enum(['true', 'false']).transform((val) => val === 'true'),
  timezone: z.string().max(MAX_SHORT_TEXT_LENGTH).default('UTC'),
  summaryOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  daysBack: z
    .string()
    .optional()
    .refine((val) => val === undefined || /^\d+$/.test(val), {
      message: 'daysBack must be a non-negative integer',
    })
    // Capped, so a request never reads more than a year of sessions.
    .transform((val) =>
      Math.min(val ? Number.parseInt(val, 10) : 365, MAX_STATS_DAYS_BACK)
    ),
  // Counts only sessions with this tag, e.g. `pomodoro`.
  tag: sessionTagSchema.optional(),
  // Counts only sessions linked to a task: Focus Time.
  taskLinked: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
});
