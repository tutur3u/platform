import {
  CalendarRecurrenceAnchorSchema,
  CalendarRecurrenceRuleSchema,
} from '@tuturuuu/utils/calendar-recurrence';
import { z } from 'zod';
import { CreateSeriesSchema, MutateSeriesSchema } from '../schema';
import { ProviderCreateMetadataSchema } from './create-metadata';
import type { ProviderSeriesPlan } from './plan';

const SourceSchema = z
  .object({ provider: z.enum(['google', 'microsoft']), connectionId: z.uuid() })
  .strict();
export const ProviderOperationInputSchema = z.discriminatedUnion('action', [
  CreateSeriesSchema.extend({
    action: z.literal('create'),
    source: SourceSchema,
  }).strict(),
  MutateSeriesSchema.safeExtend({
    action: z.literal('update'),
    source: SourceSchema,
    seriesId: z.uuid(),
  }).strict(),
  MutateSeriesSchema.safeExtend({
    action: z.literal('delete'),
    source: SourceSchema,
    seriesId: z.uuid(),
  }).strict(),
]);
export const ProviderJournalBindingSchema = z
  .object({
    wsId: z.uuid(),
    actorId: z.uuid(),
    operationId: z.uuid(),
    provider: z.enum(['google', 'microsoft']),
    connectionId: z.uuid(),
    calendarId: z.string().min(1),
  })
  .strict();
const SnapshotSchema = z
  .object({
    rule: CalendarRecurrenceRuleSchema,
    anchor: CalendarRecurrenceAnchorSchema,
    event: z
      .object({
        title: z.string().min(1),
        description: z.string().optional(),
        location: z.string().nullable().optional(),
      })
      .strict(),
  })
  .strict();
const target = {
  target: z.enum(['master', 'occurrence']),
  originalStartLocal: z.string().optional(),
  instanceId: z.string().optional(),
  instanceETag: z.string().optional(),
};
export const ProviderPlanSchema: z.ZodType<ProviderSeriesPlan> = z
  .object({
    operationId: z.uuid(),
    binding: z
      .object({
        provider: z.enum(['google', 'microsoft']),
        connectionId: z.uuid(),
        calendarId: z.string().min(1),
        masterId: z.string().min(1),
        etag: z.string().min(1),
      })
      .strict()
      .nullable(),
    steps: z
      .array(
        z.discriminatedUnion('kind', [
          z
            .object({
              kind: z.literal('create'),
              metadata: ProviderCreateMetadataSchema.optional(),
              key: z.string().min(1),
              snapshot: SnapshotSchema,
            })
            .strict(),
          z
            .object({
              kind: z.literal('update'),
              ...target,
              snapshot: SnapshotSchema,
            })
            .strict(),
          z.object({ kind: z.literal('delete'), ...target }).strict(),
          z
            .object({
              kind: z.literal('trim'),
              rule: CalendarRecurrenceRuleSchema,
              anchor: CalendarRecurrenceAnchorSchema,
            })
            .strict(),
        ])
      )
      .min(1)
      .max(2),
  })
  .strict();
