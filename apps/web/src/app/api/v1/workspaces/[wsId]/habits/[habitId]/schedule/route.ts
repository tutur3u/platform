/**
 * Habit Scheduling API
 *
 * POST - Manually trigger scheduling for a habit
 * GET  - Get scheduling status and upcoming events
 */

import { getOccurrencesInRange } from '@tuturuuu/ai/scheduling';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Habit } from '@tuturuuu/types/primitives/Habit';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';
import {
  deleteFutureHabitEvents,
  deleteFutureUnlockedHabitEvents,
  scheduleHabit,
} from '@/lib/calendar/habit-scheduler';
import { listHabitSkipHistory } from '@/lib/calendar/habit-skips';
import { habitsNotFoundResponse, isHabitsEnabled } from '@/lib/habits/access';

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

    if (!(await isHabitsEnabled(wsId))) {
      return habitsNotFoundResponse();
    }

    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to schedule habits' },
        { status: 401 }
      );
    }

    const membership = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    // Fetch habit
    const { data: habit, error: habitError } = await sbAdmin
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
    let rebuildUnlockedFutureInstances = true;
    try {
      const body = await request.json();
      if (body.windowDays && typeof body.windowDays === 'number') {
        windowDays = Math.min(Math.max(body.windowDays, 7), 90); // Limit 7-90 days
      }
      if (typeof body.rebuildUnlockedFutureInstances === 'boolean') {
        rebuildUnlockedFutureInstances = body.rebuildUnlockedFutureInstances;
      }
      // Backward-compatible: explicit reschedule means clear all future instances.
      if (body.reschedule) {
        await deleteFutureHabitEvents(sbAdmin as any, habitId);
        rebuildUnlockedFutureInstances = false;
      }
    } catch {
      // No body or invalid JSON, use defaults
    }

    if (rebuildUnlockedFutureInstances) {
      await deleteFutureUnlockedHabitEvents(sbAdmin as any, habitId);
    }

    // Schedule the habit
    const result = await scheduleHabit(
      sbAdmin as any,
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

    if (!(await isHabitsEnabled(wsId))) {
      return habitsNotFoundResponse();
    }

    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to view schedule' },
        { status: 401 }
      );
    }

    const membership = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    // Fetch habit
    const { data: habit, error: habitError } = await sbAdmin
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

    const rangeStartDate = now.toISOString().split('T')[0] ?? '';
    const rangeEndDate = rangeEnd.toISOString().split('T')[0] ?? '';
    const [scheduledEventsResult, skippedHistory] = await Promise.all([
      sbAdmin
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
        .gte('occurrence_date', rangeStartDate)
        .lte('occurrence_date', rangeEndDate)
        .order('occurrence_date', { ascending: true }),
      listHabitSkipHistory(
        sbAdmin as any,
        wsId,
        habitId,
        rangeStartDate,
        rangeEndDate
      ),
    ]);

    const scheduledEvents = scheduledEventsResult.data ?? [];
    const scheduledDates = new Set(
      scheduledEvents.map((event) => event.occurrence_date)
    );
    const skippedDates = new Set(
      skippedHistory
        .filter((skip) => !skip.revoked_at)
        .map((skip) => skip.occurrence_date)
    );

    // Build schedule status
    const schedule = upcomingOccurrences.map((occ) => {
      const dateStr = occ.toISOString().split('T')[0] ?? '';
      const scheduled = scheduledDates.has(dateStr);
      const skipped = skippedDates.has(dateStr);
      const event = scheduledEvents?.find(
        (e) => e.occurrence_date === dateStr
      ) as any;

      return {
        occurrence_date: dateStr,
        scheduled,
        completed: event?.completed ?? false,
        skipped,
        status: event?.completed
          ? 'completed'
          : scheduled
            ? 'scheduled'
            : skipped
              ? 'skipped'
              : 'to_be_scheduled',
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
    const skippedCount = schedule.filter((s) => s.skipped).length;
    const unscheduledCount = schedule.filter(
      (s) => !s.scheduled && !s.skipped
    ).length;

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
        skippedCount,
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
