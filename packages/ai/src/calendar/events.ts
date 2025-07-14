import { z } from 'zod';

export const calendarEventSchema = z.object({
  title: z.string().min(1, 'Title is required').describe('Title of the event'),
  description: z.string().optional().describe('Description of the event'),
  start_at: z
    .string()
    .describe('Start date and time of the event in ISO format'),
  end_at: z.string().describe('End date and time of the event in ISO format'),
  color: z
    .enum([
      'BLUE',
      'RED',
      'GREEN',
      'YELLOW',
      'PURPLE',
      'PINK',
      'ORANGE',
      'INDIGO',
      'CYAN',
      'GRAY',
    ])
    .default('BLUE')
    .describe(
      "Color of the event for display purposes. Should match one of the user's defined categories if applicable."
    ),
  location: z.string().optional().describe('Location of the event'),
});

export const calendarEventsSchema = z.object({
  events: z.array(calendarEventSchema),
});

export type CalendarEvent = z.infer<typeof calendarEventSchema>;
