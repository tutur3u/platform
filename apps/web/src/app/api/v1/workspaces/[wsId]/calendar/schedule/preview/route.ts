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

type PersonalTaskSchedulingRow = {
  total_duration: number | null;
  is_splittable: boolean | null;
  min_split_duration_minutes: number | null;
  max_split_duration_minutes: number | null;
  calendar_hours: string | null;
  auto_schedule: boolean | null;
  tasks: any;
};

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

    // Start of today (midnight) for habit event queries - include events that already started today
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const [
      hourSettingsResult,
      habitsResult,
      tasksResult,
      eventsResult,
      workspaceResult,
      habitEventsResult,
      taskEventsResult,
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

      // Tasks (workspace mode) OR per-user task settings (personal mode)
      // NOTE: personal mode uses task_user_scheduling_settings so each user can have different estimates.
      (supabase as any)
        .from('workspaces')
        .select('personal')
        .eq('id', wsId)
        .single()
        .then(async (wsRow: any) => {
          if (wsRow?.data?.personal) {
            const { data } = await (supabase as any)
              .from('task_user_scheduling_settings')
              .select(
                `
                total_duration,
                is_splittable,
                min_split_duration_minutes,
                max_split_duration_minutes,
                calendar_hours,
                auto_schedule,
                tasks!inner(
                  *,
                  task_lists!inner(
                    workspace_boards!inner(ws_id)
                  )
                )
              `
              )
              .eq('user_id', user.id)
              .eq('auto_schedule', true)
              .gt('total_duration', 0);

            const rows = (data as PersonalTaskSchedulingRow[] | null) ?? [];
            const mapped = rows
              .map((r) => {
                const task = r.tasks;
                const resolvedTaskWsId =
                  task?.task_lists?.workspace_boards?.ws_id ?? undefined;
                return {
                  ...task,
                  ws_id: resolvedTaskWsId,
                  total_duration: r.total_duration ?? null,
                  is_splittable: r.is_splittable ?? false,
                  min_split_duration_minutes:
                    r.min_split_duration_minutes ?? null,
                  max_split_duration_minutes:
                    r.max_split_duration_minutes ?? null,
                  calendar_hours: r.calendar_hours ?? null,
                  auto_schedule: r.auto_schedule ?? false,
                } satisfies TaskWithScheduling;
              })
              .filter(Boolean);

            return { data: mapped, error: null };
          }

          // Workspace mode: tasks are also per-user (requires signed-in user).
          const { data } = await (supabase as any)
            .from('task_user_scheduling_settings')
            .select(
              `
              total_duration,
              is_splittable,
              min_split_duration_minutes,
              max_split_duration_minutes,
              calendar_hours,
              auto_schedule,
              tasks!inner(
                *,
                task_lists!inner(
                  workspace_boards!inner(ws_id)
                )
              )
            `
            )
            .eq('user_id', user.id)
            .eq('tasks.task_lists.workspace_boards.ws_id', wsId)
            .eq('auto_schedule', true)
            .gt('total_duration', 0);

          const rows = (data as PersonalTaskSchedulingRow[] | null) ?? [];
          const mapped = rows
            .map((r) => {
              const task = r.tasks;
              const resolvedTaskWsId =
                task?.task_lists?.workspace_boards?.ws_id ?? undefined;
              return {
                ...task,
                ws_id: resolvedTaskWsId,
                total_duration: r.total_duration ?? null,
                is_splittable: r.is_splittable ?? false,
                min_split_duration_minutes:
                  r.min_split_duration_minutes ?? null,
                max_split_duration_minutes:
                  r.max_split_duration_minutes ?? null,
                calendar_hours: r.calendar_hours ?? null,
                auto_schedule: r.auto_schedule ?? false,
              } satisfies TaskWithScheduling;
            })
            .filter(Boolean);

          return { data: mapped, error: null };
        }),

      // All existing calendar events in the window (including locked ones)
      supabase
        .from('workspace_calendar_events')
        .select('id, title, start_at, end_at, color, locked')
        .eq('ws_id', wsId)
        .gt('end_at', now.toISOString())
        .lt('start_at', endDate.toISOString()),

      // Workspace timezone + mode
      supabase
        .from('workspaces')
        .select('timezone, personal')
        .eq('id', wsId)
        .single(),

      // Existing habit events via junction table - used to skip days that already have events
      supabase
        .from('habit_calendar_events')
        .select(
          `
          habit_id,
          occurrence_date,
          workspace_calendar_events!inner(id, start_at, ws_id)
        `
        )
        .eq('workspace_calendar_events.ws_id', wsId)
        .gte('workspace_calendar_events.start_at', startOfToday.toISOString())
        .lte('workspace_calendar_events.start_at', endDate.toISOString()),

      // Task calendar events - to calculate already scheduled time per task
      // Include events that have STARTED (both completed and in-progress count)
      supabase
        .from('task_calendar_events')
        .select(
          `
          task_id,
          workspace_calendar_events!inner(id, start_at, end_at, ws_id, locked)
        `
        )
        .eq('workspace_calendar_events.ws_id', wsId),
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
    const configuredTimezone = workspaceResult.data?.timezone || 'auto';
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

    // Build Set of existing habit+day combinations to skip (e.g., "habitId:2025-12-14")
    // This prevents scheduling a new habit event on a day that already has one
    // Use the event's start_at date converted to local date string with timezone for consistent matching
    const existingHabitDays = new Set<string>();
    if (habitEventsResult?.data) {
      for (const he of habitEventsResult.data as any[]) {
        const habitId = he.habit_id;
        const eventStartAt = he.workspace_calendar_events?.start_at;
        if (habitId && eventStartAt) {
          // Convert start_at to local date string using resolved timezone
          const eventDate = new Date(eventStartAt);
          const localDateStr = eventDate.toLocaleDateString('en-CA', {
            timeZone: resolvedTimezone || undefined,
          });
          existingHabitDays.add(`${habitId}:${localDateStr}`);
        }
      }
    }

    // Build set of habit event IDs that should stay in place (not be replaced)
    // These need to block their time slots during scheduling
    const habitEventIdsToKeep = new Set<string>();
    if (habitEventsResult?.data) {
      for (const he of habitEventsResult.data as any[]) {
        const eventId = he.workspace_calendar_events?.id;
        if (eventId) {
          habitEventIdsToKeep.add(eventId);
        }
      }
    }

    // Calculate already-scheduled minutes per task from PAST events
    // This prevents double-scheduling tasks that already have completed events
    const taskScheduledMinutes = new Map<string, number>();
    if (taskEventsResult?.data) {
      for (const te of taskEventsResult.data as any[]) {
        const taskId = te.task_id;
        const startAt = te.workspace_calendar_events?.start_at;
        const endAt = te.workspace_calendar_events?.end_at;
        const isLocked = te.workspace_calendar_events?.locked;

        if (taskId && startAt && endAt) {
          // Include if event is in the past OR if it's future but locked
          // Locked future events are considered "firmly scheduled" and count towards the requirement
          const isPast = new Date(startAt).getTime() < now.getTime();

          if (isPast || isLocked) {
            const duration =
              (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000; // minutes
            const current = taskScheduledMinutes.get(taskId) || 0;
            taskScheduledMinutes.set(taskId, current + duration);
          }
        }
      }
    }

    // Add scheduled_minutes to each task
    const tasksWithScheduledTime = tasks.map((task: any) => ({
      ...task,
      scheduled_minutes: taskScheduledMinutes.get(task.id) || 0,
    }));

    // Generate preview with non-all-day events only
    const preview = generatePreview(
      habits,
      tasksWithScheduledTime,
      nonAllDayEvents,
      hourSettingsResult as HourSettings,
      {
        windowDays,
        timezone: resolvedTimezone,
        existingHabitDays, // Pass existing habit+day combinations to skip
        habitEventIds: habitEventIdsToKeep, // Pass habit event IDs that should remain blocked
      }
    );

    // Format hour settings for debug log - extract ALL time blocks from each category
    // Returns default hours (07:00-23:00) if not explicitly configured
    const formatHourRanges = (
      weekRanges: any
    ): Array<{ start: string; end: string }> => {
      // Default hours used when not configured
      const defaultHours = [{ start: '07:00', end: '23:00' }];

      if (!weekRanges) return defaultHours;
      // Get Monday as representative (or first enabled day)
      const day =
        weekRanges.monday || weekRanges.tuesday || weekRanges.wednesday;
      if (!day?.enabled || !day?.timeBlocks?.length) return defaultHours;
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
      mode: workspaceResult.data?.personal ? 'personal' : 'workspace',
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

    // Include locked events for display in preview calendar
    const lockedEventsForPreview = existingEvents
      .filter((e) => e.locked)
      .map((e) => ({
        id: e.id,
        title: e.title,
        start_at: e.start_at,
        end_at: e.end_at,
        color: e.color,
        locked: true,
      }));

    // Compute affected event IDs: unlocked future events that will be modified/deleted when applying
    // EXCLUDE existing habit events that are already scheduled correctly (they stay in place)
    // habitEventIdsToKeep is already built earlier

    const affectedEventIds = existingEvents
      .filter(
        (e) =>
          !e.locked &&
          new Date(e.start_at) >= now &&
          !habitEventIdsToKeep.has(e.id) // Exclude habit events that stay in place
      )
      .map((e) => e.id);

    // Create a map of existing event signatures for comparison
    // A preview event is "reused" if it matches an existing event at the exact same position
    // Use epoch milliseconds for reliable timestamp comparison (avoids format differences)
    const existingEventSignatures = new Map<string, string>();
    for (const e of existingEvents) {
      const startEpoch = new Date(e.start_at).getTime();
      const endEpoch = new Date(e.end_at).getTime();
      const signature = `${e.title}|${startEpoch}|${endEpoch}`;
      existingEventSignatures.set(signature, e.id);
    }

    // Mark preview events as reused if they match existing events
    const eventsWithReusedFlag = preview.events.map((e) => {
      const startEpoch = new Date(e.start_at).getTime();
      const endEpoch = new Date(e.end_at).getTime();
      const signature = `${e.title}|${startEpoch}|${endEpoch}`;
      const is_reused = existingEventSignatures.has(signature);
      return { ...e, is_reused };
    });

    return NextResponse.json({
      success: true,
      preview: {
        events: eventsWithReusedFlag,
        steps: preview.steps,
        summary: preview.summary,
        warnings: preview.warnings,
      },
      lockedEvents: lockedEventsForPreview,
      affectedEventIds, // IDs of events that will be modified/deleted
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
