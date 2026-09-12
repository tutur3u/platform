import { z } from 'zod';
import { tool } from '../core';

const window = { windowDays: z.number().int().min(7).max(90).default(7) };
export const calendarAutomationToolDefinitions = {
  get_calendar_connections: tool({
    description:
      'Inspect connected Google/Microsoft calendars and current sync health before calendar automation.',
    inputSchema: z.object({}),
  }),
  connect_google_calendar: tool({
    description:
      'Get the secure Google Calendar connection URL for the user to authorize. This does not connect an account without user OAuth consent.',
    inputSchema: z.object({}),
  }),
  sync_calendar: tool({
    description:
      'Synchronize an already connected calendar. Report actual sync errors; never assume an unconnected account is connected.',
    inputSchema: z.object({
      direction: z.enum(['inbound', 'outbound', 'both']).default('both'),
    }),
  }),
  set_event_locked: tool({
    description:
      'Lock a calendar event against automatic rescheduling, or unlock it when the user requests flexibility.',
    inputSchema: z.object({ eventId: z.guid(), locked: z.boolean() }),
  }),
  preview_calendar_schedule: tool({
    description:
      'Preview prioritized scheduling of tasks and habits using real availability, deadlines and durations. Does not change events. Inspect conflicts before applying.',
    inputSchema: z.object(window),
  }),
  apply_calendar_schedule: tool({
    description:
      'Apply safe scheduling of tasks and habits, preserving locked commitments. Call preview_calendar_schedule first for the same window and explain its conflicts. Use only when the user requests scheduling changes.',
    inputSchema: z.object(window),
  }),
  get_schedulable_tasks: tool({
    description:
      'Get task scheduling constraints, duration, priority and deadlines for calendar planning.',
    inputSchema: z.object({ query: z.string().max(200).optional() }),
  }),
};
