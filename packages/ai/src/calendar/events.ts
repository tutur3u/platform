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
  is_all_day: z
    .boolean()
    .default(false)
    .describe('Whether the event is an all-day event'),
  scheduling_note: z
    .string()
    .optional()
    .describe(
      'Note explaining smart scheduling decisions if the time was adjusted to avoid conflicts'
    ),
  priority: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .describe('Priority level of the event for smart scheduling decisions'),
  //   recurrence: z
  //     .object({
  //       frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
  //       interval: z.number().int().positive().optional(),
  //       end_date: z.string().optional(),
  //       count: z.number().int().positive().optional(),
  //       days_of_week: z.array(z.number().min(0).max(6)).optional(),
  //     })
  //     .optional()
  //     .describe('Recurrence rule for repeating events'),
  //   attendees: z
  //     .array(
  //       z.object({
  //         id: z.string().describe('User ID of the attendee'),
  //         name: z.string().describe('Name of the attendee'),
  //         email: z.string().email().describe('Email of the attendee'),
  //         status: z
  //           .enum(['pending', 'accepted', 'declined', 'tentative'])
  //           .default('pending')
  //           .describe('Response status of the attendee'),
  //       })
  //     )
  //     .optional()
  //     .describe('List of attendees for the event'),
  //   reminders: z
  //     .array(
  //       z.object({
  //         time: z
  //           .number()
  //           .int()
  //           .describe('Time in minutes before the event to send a reminder'),
  //         type: z.enum(['email', 'notification']).describe('Type of reminder'),
  //       })
  //     )
  //     .optional()
  //     .describe('Reminders for the event'),
  //   ws_id: z.string().optional().describe('Workspace ID the event belongs to'),
  //   created_at: z.string().optional().describe('When the event was created'),
  //   updated_at: z.string().optional().describe('When the event was last updated'),
  //   created_by: z.string().optional().describe('User ID of the creator'),
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
