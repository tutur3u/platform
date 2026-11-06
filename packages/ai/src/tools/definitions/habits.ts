import { z } from 'zod';
import { tool } from '../core';

const isoDateTime = z
  .string()
  .datetime({ offset: true })
  .describe('ISO 8601 date-time with offset, or omit for now');
const note = z.string().trim().max(500).optional();

export const habitToolDefinitions = {
  log_body_weight: tool({
    description:
      "Log the user's body weight in their Body Weight habit tracker. If they have none, a private Body Weight tracker is created in their personal workspace; when the result has trackerCreated=true, tell the user. Values are converted to the tracker's unit.",
    inputSchema: z.object({
      value: z
        .number()
        .positive()
        .max(1500)
        .describe('Body weight in the given unit'),
      unit: z
        .enum(['kg', 'lb'])
        .optional()
        .describe("Unit of value; omit to use the tracker's unit (or kg)"),
      occurredAt: isoDateTime.optional(),
      note,
    }),
  }),

  get_body_weight_history: tool({
    description:
      "Read the user's recent body weight entries with a summary (latest, change over the period, min, max) in the tracker's unit.",
    inputSchema: z.object({
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .describe('Look-back window in days (default 30, max 365)'),
    }),
  }),

  list_habit_trackers: tool({
    description:
      'List active habit trackers in the current workspace with tracking mode, target, unit and current-period progress.',
    inputSchema: z.object({}),
  }),

  log_habit_entry: tool({
    description:
      "Log an entry for any habit tracker. Use list_habit_trackers for the ID. Pass value for the tracker's primary metric, or values keyed by field.",
    inputSchema: z
      .object({
        trackerId: z.guid().describe('Habit tracker UUID'),
        value: z
          .union([z.number(), z.boolean()])
          .optional()
          .describe("Value of the tracker's primary metric"),
        values: z
          .record(
            z.string().regex(/^[a-z0-9_]+$/),
            z.union([z.number(), z.boolean(), z.string().max(500), z.null()])
          )
          .optional()
          .describe('Field values keyed by tracker field key'),
        occurredAt: isoDateTime.optional(),
        note,
      })
      .refine((data) => data.value !== undefined || data.values, {
        message: 'value or values is required',
        path: ['value'],
      }),
  }),

  get_day_overview: tool({
    description:
      'Plan a day in one read: tasks due or overdue, calendar events, habit progress and the running timer for a date in the user timezone. Sections fail independently.',
    inputSchema: z.object({
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe('YYYY-MM-DD in the user timezone (default today)'),
    }),
  }),
};
