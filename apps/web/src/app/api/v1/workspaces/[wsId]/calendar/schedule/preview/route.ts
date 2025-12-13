/**
 * Schedule Preview API
 *
 * POST - Generate scheduling preview without persisting to database
 *
 * Returns proposed events for habits and tasks that can be:
 * 1. Shown in instant preview mode
 * 2. Animated step-by-step in demo mode
 * 3. Applied to the calendar if user confirms
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import type { TaskWithScheduling } from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { Habit } from '@tuturuuu/types/primitives/Habit';
import { isAllDayEvent } from '@tuturuuu/utils/calendar-utils';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';
import { fetchHourSettings } from '@/lib/calendar/task-scheduler';
import {
  generatePreview,
  type HourSettings,
} from '@/lib/calendar/unified-scheduler/preview-engine';

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

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to generate preview' },
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

    // Parse optional body for options
    let windowDays = 30;
    let clientTimezone: string | undefined;
    try {
      const body = await request.json();
      if (body.windowDays && typeof body.windowDays === 'number') {
        windowDays = Math.min(Math.max(body.windowDays, 7), 90);
      }
      if (typeof body.clientTimezone === 'string') {
        clientTimezone = body.clientTimezone;
      }
    } catch {
      // No body or invalid JSON, use defaults
    }

    // Fetch all required data in parallel
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + windowDays);

    const [
      hourSettingsResult,
      habitsResult,
      tasksResult,
      eventsResult,
      timezoneResult,
    ] = await Promise.all([
      // Hour settings
      fetchHourSettings(supabase as any, wsId),

      // Active habits with auto_schedule enabled AND visible in calendar
      supabase
        .from('workspace_habits')
        .select('*')
        .eq('ws_id', wsId)
        .eq('is_active', true)
        .eq('auto_schedule', true)
        .eq('is_visible_in_calendar', true)
        .is('deleted_at', null),

      // Tasks with auto_schedule enabled and duration set
      supabase
        .from('tasks')
        .select(`
          *,
          task_lists!inner(
            workspace_boards!inner(ws_id)
          )
        `)
        .eq('task_lists.workspace_boards.ws_id', wsId)
        .eq('auto_schedule', true)
        .gt('total_duration', 0),

      // All existing calendar events in the window (including locked ones)
      supabase
        .from('workspace_calendar_events')
        .select('id, title, start_at, end_at, color, locked')
        .eq('ws_id', wsId)
        .gt('end_at', now.toISOString())
        .lt('start_at', endDate.toISOString()),

      // Workspace timezone
      supabase
        .from('workspaces')
        .select('timezone')
        .eq('id', wsId)
        .single(),
    ]);

    if (habitsResult.error) {
      console.error('Error fetching habits:', habitsResult.error);
    }
    if (tasksResult.error) {
      console.error('Error fetching tasks:', tasksResult.error);
    }
    if (eventsResult.error) {
      console.error('Error fetching events:', eventsResult.error);
    }

    const habits = (habitsResult.data as Habit[]) || [];
    const tasks = (tasksResult.data as TaskWithScheduling[]) || [];
    const existingEvents = (eventsResult.data || []).map((e) => ({
      id: e.id,
      title: e.title,
      start_at: e.start_at,
      end_at: e.end_at,
      color: e.color,
      locked: e.locked,
    })) as CalendarEvent[];

    // Filter out all-day events - they shouldn't block hour-level scheduling
    // All-day events (midnight-to-midnight, multiple of 24h) represent full-day
    // commitments like holidays, not specific time blocks.
    const nonAllDayEvents = existingEvents.filter((e) => !isAllDayEvent(e));
    const allDayEventsCount = existingEvents.length - nonAllDayEvents.length;

    const isValidTz = (tz: string) => {
      try {
        // eslint-disable-next-line no-new
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    };

    // Resolve timezone:
    // - If workspace has a fixed IANA timezone, use it.
    // - If workspace timezone is auto/unset, require clientTimezone (browser) for user-initiated requests.
    const configuredTimezone = timezoneResult.data?.timezone || 'auto';
    const needsClientTimezone =
      !configuredTimezone || configuredTimezone === 'auto';
    const resolvedTimezone = !needsClientTimezone
      ? configuredTimezone
      : (() => {
          if (!clientTimezone || !isValidTz(clientTimezone)) {
            throw new Error(
              'Workspace timezone is not set. Please set a fixed workspace timezone before using Smart Schedule.'
            );
          }
          return clientTimezone;
        })();

    // Generate preview with non-all-day events only
    const preview = generatePreview(
      habits,
      tasks,
      nonAllDayEvents,
      hourSettingsResult as HourSettings,
      {
        windowDays,
        timezone: resolvedTimezone,
      }
    );

    // Format hour settings for debug log - extract ALL time blocks from each category
    const formatHourRanges = (
      weekRanges: any
    ): Array<{ start: string; end: string }> | null => {
      if (!weekRanges) return null;
      // Get Monday as representative (or first enabled day)
      const day =
        weekRanges.monday || weekRanges.tuesday || weekRanges.wednesday;
      if (!day?.enabled || !day?.timeBlocks?.length) return null;
      // Return all time blocks
      return day.timeBlocks.map(
        (block: { startTime: string; endTime: string }) => ({
          start: block.startTime,
          end: block.endTime,
        })
      );
    };

    // Count locked vs unlocked events
    const lockedEvents = existingEvents.filter((e) => e.locked);
    const unlockedEvents = existingEvents.filter((e) => !e.locked);

    // Debug info with full details
    const debugInfo = {
      habitsWithAutoSchedule: habits.length,
      tasksWithAutoSchedule: tasks.length,
      existingEventsCount: existingEvents.length,
      lockedEventsCount: lockedEvents.length,
      unlockedEventsCount: unlockedEvents.length,
      allDayEventsCount,
      hourSettings: {
        working_hours: formatHourRanges(hourSettingsResult?.workHours),
        personal_hours: formatHourRanges(hourSettingsResult?.personalHours),
        meeting_hours: formatHourRanges(hourSettingsResult?.meetingHours),
      },
      configuredTimezone,
      resolvedTimezone,
      // Full habit details for debugging
      habitDetails: habits.map((h) => ({
        id: h.id,
        name: h.name,
        frequency: h.frequency,
        duration_minutes: h.duration_minutes,
        calendar_hours: h.calendar_hours,
        priority: h.priority,
        auto_schedule: h.auto_schedule,
        is_visible_in_calendar: h.is_visible_in_calendar,
        ideal_time: h.ideal_time,
        time_preference: h.time_preference,
      })),
      // Full task details for debugging
      taskDetails: tasks.map((t) => ({
        id: t.id,
        name: t.name,
        total_duration: t.total_duration,
        calendar_hours: t.calendar_hours,
        priority: t.priority,
        auto_schedule: t.auto_schedule,
        is_splittable: t.is_splittable,
        start_date: t.start_date,
        end_date: t.end_date,
      })),
      // Locked events that block scheduling (first 10 for brevity)
      lockedEventsBlocking: lockedEvents.slice(0, 10).map((e) => ({
        id: e.id,
        title: e.title,
        start_at: e.start_at,
        end_at: e.end_at,
      })),
    };

    return NextResponse.json({
      success: true,
      preview: {
        events: preview.events,
        steps: preview.steps,
        summary: preview.summary,
        warnings: preview.warnings,
      },
      habits: {
        total: habits.length,
        scheduled: preview.habits.events.length,
        warnings: preview.habits.warnings,
      },
      tasks: {
        total: tasks.length,
        scheduled: preview.tasks.events.filter((t) => t.events.length > 0)
          .length,
        partiallyScheduled: preview.summary.partiallyScheduledTasks,
        unscheduled: preview.summary.unscheduledTasks,
        warnings: preview.tasks.warnings,
        details: preview.tasks.events.map((t) => ({
          taskId: t.task.id,
          taskName: t.task.name,
          scheduledMinutes: t.scheduledMinutes,
          totalMinutesRequired: t.totalMinutesRequired,
          remainingMinutes: t.remainingMinutes,
          warning: t.warning,
          warningLevel: t.warningLevel,
          eventCount: t.events.length,
        })),
      },
      windowDays,
      debug: debugInfo,
    });
  } catch (error) {
    console.error('Error generating schedule preview:', error);
    if (
      error instanceof Error &&
      error.message.startsWith('Workspace timezone is not set')
    ) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
