import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SEARCH_LENGTH,
} from '@tuturuuu/utils/constants';
import { z } from 'zod';
import { CalendarEventColorSchema } from './event-color';
import { GoogleProviderColorChoiceSchema } from './google-color-choices';

const CalendarSourceSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('tuturuuu'),
    workspaceCalendarId: z.guid().optional().nullable(),
  }),
  z.object({
    provider: z.literal('google'),
    connectionId: z.guid(),
  }),
  z.object({
    provider: z.literal('microsoft'),
    connectionId: z.guid(),
  }),
]);

export const updateEventSchema = z.object({
  title: z.string().max(MAX_NAME_LENGTH).optional(),
  description: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  location: z.string().max(MAX_SEARCH_LENGTH).optional(),
  start_at: z.string().datetime().optional(),
  end_at: z.string().datetime().optional(),
  color: CalendarEventColorSchema.optional(),
  providerColor: GoogleProviderColorChoiceSchema.optional(),
  locked: z.boolean().optional(),
  source: CalendarSourceSchema.optional(),
});
