import { z } from 'zod';

export const calendarEventSchema = z.object({
  //   id: z.string().optional().describe('Unique identifier for the event'),
  title: z.string().min(1, 'Title is required').describe('Title of the event'),
  description: z.string().optional().describe('Description of the event'),
  start_at: z
    .string()
    .describe('Start date and time of the event in ISO format'),
  end_at: z.string().describe('End date and time of the event in ISO format'),
  color: z
    .enum([
      'blue',
      'red',
      'green',
      'yellow',
      'purple',
      'pink',
      'orange',
      'gray',
    ])
    .default('blue')
    .describe('Color of the event for display purposes'),
  location: z.string().optional().describe('Location of the event'),
});

export const calendarEventsSchema = z.array(calendarEventSchema);

export type CalendarEvent = z.infer<typeof calendarEventSchema>;

// This schema is for notifications related to calendar events
export const notificationSchema = z.object({
  notifications: z.array(
    z.object({
      name: z.string().describe('Name of a fictional person.'),
      message: z.string().describe('Message. Do not use emojis or links.'),
    })
  ),
});
