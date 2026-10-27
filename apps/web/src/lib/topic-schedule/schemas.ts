import {
  isScheduleMonth,
  TOPIC_SCHEDULE_MAX_DURATION_MINUTES,
  TOPIC_SCHEDULE_MIN_DURATION_MINUTES,
} from '@tuturuuu/utils/topic-schedule';
import { z } from 'zod';

/** Same room/place limits as creating one announcement or importing rows. */
const LOCATION_MAX_LENGTH = 500;
export const SCHEDULE_SAVE_MAX_ROWS = 500;

const MonthSchema = z
  .string()
  .refine(isScheduleMonth, { message: 'Expected YYYY-MM' });

const LocationSchema = z
  .string()
  .trim()
  .max(LOCATION_MAX_LENGTH)
  .nullable()
  .optional()
  .transform((value) => value || null);

export const ScheduleMonthQuerySchema = z.object({ month: MonthSchema });

export const ScheduleSessionInputSchema = z.object({
  durationMinutes: z
    .number()
    .int()
    .min(TOPIC_SCHEDULE_MIN_DURATION_MINUTES)
    .max(TOPIC_SCHEDULE_MAX_DURATION_MINUTES),
  groupId: z.string().uuid(),
  gvnnContactId: z.string().uuid().nullable(),
  /** Present to edit an existing session of this month. */
  id: z.string().uuid().optional(),
  place: LocationSchema,
  room: LocationSchema,
  sessionDate: z.string().date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u),
});

export type ScheduleSessionInput = z.infer<typeof ScheduleSessionInputSchema>;

export const ScheduleSaveSchema = z
  .object({
    deleteIds: z.array(z.string().uuid()).max(SCHEDULE_SAVE_MAX_ROWS),
    month: MonthSchema,
    sessions: z.array(ScheduleSessionInputSchema).max(SCHEDULE_SAVE_MAX_ROWS),
  })
  .superRefine((value, context) => {
    const ids = value.sessions.flatMap((session) =>
      session.id ? [session.id] : []
    );
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', message: 'Duplicate session id' });
    }
    const deletes = new Set(value.deleteIds);
    if (ids.some((id) => deletes.has(id))) {
      context.addIssue({
        code: 'custom',
        message: 'A session cannot be edited and deleted together',
      });
    }
  });

export type ScheduleSaveInput = z.infer<typeof ScheduleSaveSchema>;

export const ScheduleCloneSchema = z
  .object({
    dryRun: z.boolean(),
    sourceMonth: MonthSchema,
    targetMonth: MonthSchema,
  })
  .refine((value) => value.sourceMonth !== value.targetMonth, {
    message: 'Source and target month must differ',
  });
