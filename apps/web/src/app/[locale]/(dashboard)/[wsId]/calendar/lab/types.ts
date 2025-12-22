import type { TaskWithScheduling } from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { Habit } from '@tuturuuu/types/primitives/Habit';
import { z } from 'zod';

const TimeBlockSchema = z.object({
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
});

const DayTimeRangeSchema = z.object({
  enabled: z.boolean(),
  timeBlocks: z.array(TimeBlockSchema),
});

const WeekTimeRangesSchema = z.object({
  monday: DayTimeRangeSchema,
  tuesday: DayTimeRangeSchema,
  wednesday: DayTimeRangeSchema,
  thursday: DayTimeRangeSchema,
  friday: DayTimeRangeSchema,
  saturday: DayTimeRangeSchema,
  sunday: DayTimeRangeSchema,
});

export const HourSettingsSchema = z.object({
  workHours: WeekTimeRangesSchema,
  personalHours: WeekTimeRangesSchema,
  meetingHours: WeekTimeRangesSchema,
});

export type HourSettings = z.infer<typeof HourSettingsSchema>;

export const CalendarScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tasks: z.array(z.any()), // TaskWithScheduling is complex, using any for now but will type it in code
  habits: z.array(z.any()), // Habit is complex
  events: z.array(z.any()), // CalendarEvent is complex
  settings: z.object({
    hours: HourSettingsSchema,
    timezone: z.string(),
  }),
});

export type CalendarScenario = {
  id: string;
  name: string;
  description: string;
  tasks: TaskWithScheduling[];
  habits: Habit[];
  events: CalendarEvent[];
  settings: {
    hours: HourSettings;
    timezone: string;
  };
};
