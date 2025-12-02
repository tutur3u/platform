/**
 * Unified Schedule API
 *
 * POST - Trigger unified scheduling for habits and tasks
 * GET  - Get scheduling status and metadata for the workspace
 *
 * This endpoint uses the unified scheduler which:
 * 1. Schedules habits FIRST (by priority)
 * 2. Schedules tasks SECOND (by deadline + priority)
 * 3. Allows urgent tasks to bump lower-priority habit events
 * 4. Reschedules bumped habits to next available slots
 */

import { scheduleWorkspace } from '@/lib/calendar/unified-scheduler';
import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';

interface RouteParams {
  wsId: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId } = await params;

    if (!validate(wsId)) {
      return NextResponse.json(
        { error: 'Invalid workspace ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check for cron secret authorization (for background jobs)
    const cronSecret =
      process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';
    const authHeader = request.headers.get('Authorization');
    const isCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

    // If not cron auth, require user authentication
    if (!isCronAuth) {
      // Get authenticated user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json(
          { error: 'Please sign in to schedule' },
          { status: 401 }
        );
      }

      // Verify workspace access
      const { data: memberCheck } = await supabase
        .from('workspace_members')
        .select('user_id')
        .eq('ws_id', wsId)
        .eq('user_id', user.id)
        .single();

      if (!memberCheck) {
        return NextResponse.json(
          { error: "You don't have access to this workspace" },
          { status: 403 }
        );
      }
    }

    // Parse optional body for options
    let windowDays = 30;
    let forceReschedule = false;
    try {
      const body = await request.json();
      if (body.windowDays && typeof body.windowDays === 'number') {
        windowDays = Math.min(Math.max(body.windowDays, 7), 90); // Limit 7-90 days
      }
      if (body.forceReschedule === true) {
        forceReschedule = true;
      }
    } catch {
      // No body or invalid JSON, use defaults
    }

    // Run unified scheduling
    const result = await scheduleWorkspace(supabase as any, wsId, {
      windowDays,
      forceReschedule,
    });

    // Calculate summary statistics
    const habitsScheduled = result.habits.events.length;
    const tasksScheduled = result.tasks.events.filter(
      (t) => t.events.length > 0
    ).length;
    const eventsCreated =
      result.habits.events.length +
      result.tasks.events.reduce((sum, t) => sum + t.events.length, 0);
    const bumpedHabits = result.tasks.bumpedHabits.length;
    const rescheduledHabits = result.rescheduledHabits.length;

    // Update scheduling metadata
    try {
      await supabase.rpc('upsert_scheduling_metadata', {
        p_ws_id: wsId,
        p_status:
          result.warnings.length > 0
            ? habitsScheduled === 0 && tasksScheduled === 0
              ? 'failed'
              : 'partial'
            : 'success',
        p_message:
          result.warnings.length > 0
            ? result.warnings.join('; ')
            : `Scheduled ${habitsScheduled} habits and ${tasksScheduled} tasks`,
        p_habits_scheduled: habitsScheduled,
        p_tasks_scheduled: tasksScheduled,
        p_events_created: eventsCreated,
        p_bumped_habits: bumpedHabits,
        p_window_days: windowDays,
      });
    } catch (e) {
      console.error('Error updating scheduling metadata:', e);
      // Non-fatal, continue
    }

    return NextResponse.json({
      success: true,
      summary: {
        habitsScheduled,
        tasksScheduled,
        eventsCreated,
        bumpedHabits,
        rescheduledHabits,
        windowDays,
      },
      habits: {
        events: result.habits.events.map((h) => ({
          habitId: h.habit.id,
          habitName: h.habit.name,
          occurrence: h.occurrence.toISOString().split('T')[0],
          duration: h.duration,
          event: {
            id: h.event.id,
            start_at: h.event.start_at,
            end_at: h.event.end_at,
          },
        })),
        warnings: result.habits.warnings,
      },
      tasks: {
        events: result.tasks.events.map((t) => ({
          taskId: t.task.id,
          taskName: t.task.name,
          scheduledMinutes: t.scheduledMinutes,
          warning: t.warning,
          events: t.events.map((e) => ({
            id: e.id,
            start_at: e.start_at,
            end_at: e.end_at,
            scheduled_minutes: e.scheduled_minutes,
          })),
        })),
        bumpedHabits: result.tasks.bumpedHabits.map((b) => ({
          habitId: b.habit.id,
          habitName: b.habit.name,
          occurrence: b.occurrence.toISOString().split('T')[0],
          originalEventId: b.originalEvent.id,
        })),
        warnings: result.tasks.warnings,
      },
      rescheduledHabits: result.rescheduledHabits.map((h) => ({
        habitId: h.habit.id,
        habitName: h.habit.name,
        occurrence: h.occurrence.toISOString().split('T')[0],
        duration: h.duration,
        event: {
          id: h.event.id,
          start_at: h.event.start_at,
          end_at: h.event.end_at,
        },
      })),
      warnings: result.warnings,
    });
  } catch (error) {
    console.error('Error in unified schedule POST:', error);
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
    const { wsId } = await params;

    if (!validate(wsId)) {
      return NextResponse.json(
        { error: 'Invalid workspace ID' },
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
        { error: 'Please sign in to view schedule status' },
        { status: 401 }
      );
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    // Fetch scheduling metadata
    const { data: metadata } = await supabase
      .from('workspace_scheduling_metadata')
      .select('*')
      .eq('ws_id', wsId)
      .single();

    // Fetch counts of schedulable items
    const [habitsResult, tasksResult] = await Promise.all([
      supabase
        .from('workspace_habits')
        .select('id', { count: 'exact' })
        .eq('ws_id', wsId)
        .eq('is_active', true)
        .eq('auto_schedule', true)
        .is('deleted_at', null),
      supabase
        .from('tasks')
        .select(
          `
          id,
          task_lists!inner(
            workspace_boards!inner(ws_id)
          )
        `,
          { count: 'exact' }
        )
        .eq('task_lists.workspace_boards.ws_id', wsId)
        .eq('auto_schedule', true)
        .gt('total_duration', 0),
    ]);

    return NextResponse.json({
      lastScheduledAt: metadata?.last_scheduled_at ?? null,
      lastStatus: metadata?.last_status ?? null,
      lastMessage: metadata?.last_message ?? null,
      statistics: {
        habitsScheduled: metadata?.habits_scheduled ?? 0,
        tasksScheduled: metadata?.tasks_scheduled ?? 0,
        eventsCreated: metadata?.events_created ?? 0,
        bumpedHabits: metadata?.bumped_habits ?? 0,
        windowDays: metadata?.window_days ?? 30,
      },
      schedulableItems: {
        activeHabits: habitsResult.count ?? 0,
        autoScheduleTasks: tasksResult.count ?? 0,
      },
    });
  } catch (error) {
    console.error('Error in unified schedule GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
