/**
 * Habit Scheduling API
 *
 * POST - Manually trigger scheduling for a habit
 * GET  - Get scheduling status and upcoming events
 */

import { getOccurrencesInRange } from '@tuturuuu/ai/scheduling';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { Habit } from '@tuturuuu/types/primitives/Habit';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';
import {
  deleteFutureHabitEvents,
  scheduleHabit,
} from '@/lib/calendar/habit-scheduler';

interface RouteParams {
  wsId: string;
  habitId: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId, habitId } = await params;

    if (!validate(wsId) || !validate(habitId)) {
      return NextResponse.json(
        { error: 'Invalid workspace or habit ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to schedule habits' },
        { status: 401 }
      );
    }

    // Fetch habit
    const { data: habit, error: habitError } = await supabase
      .from('workspace_habits')
      .select('*')
      .eq('id', habitId)
      .eq('ws_id', wsId)
      .is('deleted_at', null)
      .single();

    if (habitError || !habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    // Parse optional body for window days
    let windowDays = 30;
    try {
      const body = await request.json();
      if (body.windowDays && typeof body.windowDays === 'number') {
        windowDays = Math.min(Math.max(body.windowDays, 7), 90); // Limit 7-90 days
      }
      // If reschedule flag is set, delete future events first
      if (body.reschedule) {
        await deleteFutureHabitEvents(supabase as any, habitId);
      }
    } catch {
      // No body or invalid JSON, use defaults
    }

    // Schedule the habit
    const result = await scheduleHabit(
      supabase as any,
      wsId,
      habit as Habit,
      windowDays
    );

    return NextResponse.json({
      success: result.success,
      message: result.message,
      eventsCreated: result.eventsCreated,
      occurrencesScheduled: result.occurrencesScheduled,
      totalOccurrences: result.totalOccurrences,
      events: result.events,
    });
  } catch (error) {
    console.error('Error in habit schedule POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId, habitId } = await params;

    if (!validate(wsId) || !validate(habitId)) {
      return NextResponse.json(
        { error: 'Invalid workspace or habit ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to view schedule' },
        { status: 401 }
      );
    }

    // Fetch habit
    const { data: habit, error: habitError } = await supabase
      .from('workspace_habits')
      .select('*')
      .eq('id', habitId)
      .eq('ws_id', wsId)
      .is('deleted_at', null)
      .single();

    if (habitError || !habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    // Calculate upcoming occurrences (next 30 days)
    const now = new Date();
    const rangeEnd = new Date(now);
    rangeEnd.setDate(rangeEnd.getDate() + 30);

    const upcomingOccurrences = getOccurrencesInRange(
      habit as Habit,
      now,
      rangeEnd
    );

    // Fetch scheduled events for these occurrences
    const { data: scheduledEvents } = await supabase
      .from('habit_calendar_events')
      .select(`
        occurrence_date,
        completed,
        workspace_calendar_events (
          id,
          title,
          start_at,
          end_at
        )
      `)
      .eq('habit_id', habitId)
      .gte('occurrence_date', now.toISOString().split('T')[0])
      .lte('occurrence_date', rangeEnd.toISOString().split('T')[0])
      .order('occurrence_date', { ascending: true });

    const scheduledDates = new Set(
      scheduledEvents?.map((e) => e.occurrence_date) || []
    );

    // Build schedule status
    const schedule = upcomingOccurrences.map((occ) => {
      const dateStr = occ.toISOString().split('T')[0] ?? '';
      const scheduled = scheduledDates.has(dateStr);
      const event = scheduledEvents?.find(
        (e) => e.occurrence_date === dateStr
      ) as any;

      return {
        occurrence_date: dateStr,
        scheduled,
        completed: event?.completed ?? false,
        event: scheduled
          ? {
              id: event?.workspace_calendar_events?.id,
              title: event?.workspace_calendar_events?.title,
              start_at: event?.workspace_calendar_events?.start_at,
              end_at: event?.workspace_calendar_events?.end_at,
            }
          : null,
      };
    });

    const scheduledCount = schedule.filter((s) => s.scheduled).length;
    const unscheduledCount = schedule.filter((s) => !s.scheduled).length;

    return NextResponse.json({
      habit: {
        id: habit.id,
        name: habit.name,
        frequency: habit.frequency,
        recurrence_interval: habit.recurrence_interval,
        auto_schedule: habit.auto_schedule,
        is_active: habit.is_active,
      },
      scheduling: {
        totalOccurrences: schedule.length,
        scheduledCount,
        unscheduledCount,
        isFullyScheduled: unscheduledCount === 0,
      },
      schedule,
    });
  } catch (error) {
    console.error('Error in habit schedule GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
