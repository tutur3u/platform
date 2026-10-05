import {
  CalendarLocalDateTimeSchema,
  CalendarRecurrenceAnchorSchema,
  CalendarRecurrenceRuleSchema,
} from '@tuturuuu/utils/calendar-recurrence';
import {
  MAX_CALENDAR_EVENT_DESCRIPTION_LENGTH,
  MAX_CALENDAR_EVENT_TITLE_LENGTH,
  MAX_SEARCH_LENGTH,
} from '@tuturuuu/utils/constants';
import { z } from 'zod';
import {
  CalendarEventColorSchema,
  DefaultCalendarEventColorSchema,
} from '../event-color';

export const SeriesEventSchema = z
  .object({
    title: z.string().min(1).max(MAX_CALENDAR_EVENT_TITLE_LENGTH),
    description: z
      .string()
      .max(MAX_CALENDAR_EVENT_DESCRIPTION_LENGTH)
      .default(''),
    location: z.string().max(MAX_SEARCH_LENGTH).nullable().default(null),
    color: DefaultCalendarEventColorSchema,
    locked: z.boolean().default(false),
  })
  .strict();
export const SeriesEventPatchSchema = z
  .object({
    title: z.string().min(1).max(MAX_CALENDAR_EVENT_TITLE_LENGTH),
    description: z.string().max(MAX_CALENDAR_EVENT_DESCRIPTION_LENGTH),
    location: z.string().max(MAX_SEARCH_LENGTH).nullable(),
    color: CalendarEventColorSchema,
    locked: z.boolean(),
  })
  .partial()
  .strict();
export const CreateSeriesSchema = z
  .object({
    requestId: z.uuid(),
    rule: CalendarRecurrenceRuleSchema,
    anchor: CalendarRecurrenceAnchorSchema,
    event: SeriesEventSchema,
    workspaceCalendarId: z.uuid().nullable().optional(),
  })
  .strict();
export const MutateSeriesSchema = z
  .object({
    requestId: z.uuid(),
    expectedRevision: z.number().int().positive(),
    scope: z.enum(['this', 'all', 'future']),
    originalStartLocal: CalendarLocalDateTimeSchema.optional(),
    event: SeriesEventPatchSchema.optional(),
    rule: CalendarRecurrenceRuleSchema.optional(),
    anchor: CalendarRecurrenceAnchorSchema.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.scope !== 'all' && !input.originalStartLocal)
      ctx.addIssue({
        code: 'custom',
        path: ['originalStartLocal'],
        message: 'Occurrence identity required',
      });
    if (input.scope === 'this' && input.rule)
      ctx.addIssue({
        code: 'custom',
        path: ['rule'],
        message: 'A single occurrence cannot change the series rule',
      });
  });
export const StoredSeriesSchema = z
  .object({
    id: z.uuid(),
    ws_id: z.uuid(),
    revision: z.number().int().positive(),
    workspace_calendar_id: z.uuid().nullable(),
    providerSource: z
      .object({
        provider: z.enum(['google', 'microsoft']),
        connectionId: z.uuid(),
        externalCalendarId: z.string(),
        externalEventId: z.string(),
      })
      .nullable()
      .optional(),
    rule: CalendarRecurrenceRuleSchema,
    anchor: CalendarRecurrenceAnchorSchema,
    payload: z
      .object({
        title: z.string(),
        description: z.string().default(''),
        location: z.string().nullable().optional(),
        is_encrypted: z.boolean().optional(),
      })
      .passthrough(),
    exceptions: z
      .array(
        z.object({
          originalStartLocal: CalendarLocalDateTimeSchema,
          exception: z
            .object({
              cancelled: z.boolean().optional(),
              startLocal: CalendarLocalDateTimeSchema.optional(),
              endLocal: CalendarLocalDateTimeSchema.optional(),
            })
            .strict(),
          payload: z.record(z.string(), z.unknown()).nullable(),
        })
      )
      .max(1000),
  })
  .passthrough();
export type StoredSeries = z.infer<typeof StoredSeriesSchema>;
