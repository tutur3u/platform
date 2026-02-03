import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  WorkspaceCalendar,
  WorkspaceCalendarEvent,
} from '@tuturuuu/types';

import { type DateRange, queryKeys } from '@/lib/query';
import { supabase } from '@/lib/supabase';

// Explicit types for calendar data with relations
export type CalendarEventWithRelations = WorkspaceCalendarEvent & {
  calendar?: {
    id: string;
    name: string | null;
    color: string | null;
  } | null;
};

/**
 * Fetch calendar events for a workspace within a date range
 */
export function useCalendarEvents(
  wsId: string | undefined,
  range: DateRange | undefined
) {
  return useQuery<CalendarEventWithRelations[]>({
    queryKey: queryKeys.calendar.events(
      wsId ?? '',
      range ?? { start: '', end: '' }
    ),
    queryFn: async () => {
      if (!wsId || !range?.start || !range?.end) return [];

      const { data, error } = await supabase
        .from('workspace_calendar_events')
        .select(
          `
          *,
          calendar:workspace_calendars (
            id,
            name,
            color
          )
        `
        )
        .eq('ws_id', wsId)
        .gte('start_at', range.start)
        .lte('end_at', range.end)
        .order('start_at', { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as CalendarEventWithRelations[];
    },
    enabled: !!wsId && !!range?.start && !!range?.end,
  });
}

/**
 * Fetch a single calendar event by ID
 */
export function useCalendarEvent(
  wsId: string | undefined,
  eventId: string | undefined
) {
  return useQuery<CalendarEventWithRelations | null>({
    queryKey: queryKeys.calendar.event(wsId ?? '', eventId ?? ''),
    queryFn: async () => {
      if (!wsId || !eventId) return null;

      const { data, error } = await supabase
        .from('workspace_calendar_events')
        .select(
          `
          *,
          calendar:workspace_calendars (
            id,
            name,
            color
          )
        `
        )
        .eq('id', eventId)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data as CalendarEventWithRelations;
    },
    enabled: !!wsId && !!eventId,
  });
}

/**
 * Fetch calendars for a workspace
 */
export function useCalendars(wsId: string | undefined) {
  return useQuery<WorkspaceCalendar[]>({
    queryKey: queryKeys.calendar.calendars(wsId ?? ''),
    queryFn: async () => {
      if (!wsId) return [];

      const { data, error } = await supabase
        .from('workspace_calendars')
        .select('*')
        .eq('ws_id', wsId)
        .order('name', { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as WorkspaceCalendar[];
    },
    enabled: !!wsId,
  });
}

/**
 * Calendar event mutation hooks
 */
export function useCalendarMutations(wsId: string) {
  const queryClient = useQueryClient();

  const createEvent = useMutation({
    mutationFn: async (
      event: Partial<WorkspaceCalendarEvent> & {
        calendar_id: string;
        start_at: string;
        end_at: string;
      }
    ) => {
      const { data, error } = await supabase
        .from('workspace_calendar_events')
        .insert({
          title: event.title ?? 'Untitled Event',
          description: event.description,
          ws_id: wsId,
          calendar_id: event.calendar_id,
          start_at: event.start_at,
          end_at: event.end_at,
          location: event.location,
          color: event.color,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all(wsId) });
    },
  });

  const updateEvent = useMutation({
    mutationFn: async ({
      eventId,
      updates,
    }: {
      eventId: string;
      updates: Partial<WorkspaceCalendarEvent>;
    }) => {
      const { data, error } = await supabase
        .from('workspace_calendar_events')
        .update(updates)
        .eq('id', eventId)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.calendar.event(wsId, variables.eventId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all(wsId) });
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from('workspace_calendar_events')
        .delete()
        .eq('id', eventId);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all(wsId) });
    },
  });

  return {
    createEvent,
    updateEvent,
    deleteEvent,
  };
}

/**
 * Get date range for different calendar views
 */
export function getDateRange(
  view: 'agenda' | 'day' | '3day' | 'week' | 'month',
  date: Date = new Date()
): DateRange {
  const start = new Date(date);
  const end = new Date(date);

  switch (view) {
    case 'agenda':
      // 30 days from now
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() + 30);
      end.setHours(23, 59, 59, 999);
      break;

    case 'day':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;

    case '3day':
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() + 2);
      end.setHours(23, 59, 59, 999);
      break;

    case 'week': {
      // Start from Monday
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    }

    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      break;
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
