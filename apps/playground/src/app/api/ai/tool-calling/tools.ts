import { tool } from '@tuturuuu/ai/tools/core';
import { createClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';

export const fetchCalendarEvents = tool({
  description: 'Fetch calendar events',
  parameters: z.object({
    startDate: z.string().optional().describe('The start date of the events'),
    endDate: z.string().optional().describe('The end date of the events'),
  }),
  execute: async ({ startDate, endDate }) => {
    const supabase = await createClient();

    const queryBuilder = supabase
      .from('workspace_calendar_events')
      .select('*')
      .eq('ws_id', '00000000-0000-0000-0000-000000000000')
      .limit(100);

    if (startDate) queryBuilder.gte('start_at', startDate);
    if (endDate) queryBuilder.lte('end_at', endDate);

    const { data, error } = await queryBuilder.order('start_at', {
      ascending: false,
    });

    if (error) {
      throw new Error(error.message);
    }

    console.log(data);

    return {
      events: data,
    };
  },
});

export const addEvent = tool({
  description: 'Add an event to the calendar',
  parameters: z.object({
    title: z.string().describe('The title of the event'),
    description: z.string().describe('The description of the event'),
    startAt: z.string().describe('The start date of the event'),
    endAt: z.string().describe('The end date of the event'),
  }),
  execute: async ({ title, description, startAt, endAt }) => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('workspace_calendar_events')
      .insert({
        title,
        description,
        start_at: startAt,
        end_at: endAt,
        ws_id: '00000000-0000-0000-0000-000000000000',
      });

    if (error) {
      throw new Error(error.message);
    }

    return {
      event: data,
    };
  },
});

export const moveEvent = tool({
  description: 'Move an event to a new time',
  parameters: z.object({
    eventId: z.string().describe('The id of the event'),
    startAt: z.string().describe('The start date of the event'),
    endAt: z.string().describe('The end date of the event'),
  }),
  execute: async ({ eventId, startAt, endAt }) => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('workspace_calendar_events')
      .update({ start_at: startAt, end_at: endAt })
      .eq('id', eventId);

    if (error) {
      throw new Error(error.message);
    }

    return {
      event: data,
    };
  },
});
