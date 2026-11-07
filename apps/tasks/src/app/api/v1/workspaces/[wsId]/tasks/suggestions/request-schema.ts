import {
  MAX_COLOR_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import { isValidTimezone } from '@tuturuuu/utils/timezone';
import { z } from 'zod';

export const requestSchema = z.object({
  boardId: z.guid(),
  prompt: z.string().trim().min(1).max(MAX_LONG_TEXT_LENGTH),
  description: z.string().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
  currentListId: z.guid().optional(),
  clientTimezone: z
    .string()
    .trim()
    .max(MAX_SHORT_TEXT_LENGTH)
    .refine((timezone) => !timezone || isValidTimezone(timezone), {
      message: 'Invalid client timezone',
    })
    .optional(),
  clientTimestamp: z.string().max(MAX_COLOR_LENGTH).optional(),
});
