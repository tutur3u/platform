/**
 * Unified Schedule API
 *
 * POST - Trigger unified scheduling for habits and tasks
 * GET  - Get scheduling status and metadata for the workspace
 *
 * This endpoint uses the preview-engine for scheduling logic:
 * 1. Schedules habits FIRST (by priority, respecting ideal_time)
 * 2. Schedules tasks SECOND (by deadline + priority, back-to-back)
 * 3. Skips habit instances that deviate too far from preferred time
 *
 * All scheduling uses the same algorithm as the preview panel.
 */

import { fetchHourSettings } from '@/lib/calendar/task-scheduler';
import {
  generatePreview,
  type HourSettings,
  type PreviewEvent,
} from '@/lib/calendar/unified-scheduler/preview-engine';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { TaskWithScheduling } from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { Habit } from '@tuturuuu/types/primitives/Habit';
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
    let previewEvents: PreviewEvent[] | undefined;
    try {
      const body = await request.json();
      if (body.windowDays && typeof body.windowDays === 'number') {
        windowDays = Math.min(Math.max(body.windowDays, 7), 90); // Limit 7-90 days
      }
      if (Array.isArray(body.previewEvents)) {
        previewEvents = body.previewEvents as PreviewEvent[];
        console.log(
          `[Schedule] Received ${previewEvents.length} preview events from client`
        );
        if (previewEvents.length > 0 && previewEvents[0]) {
          console.log(
            `[Schedule] First event sample:`,
            JSON.stringify(previewEvents[0], null, 2)
          );
        }
      } else {
        console.log(
          `[Schedule] No preview events in body, will generate fresh`
        );
      }
    } catch (parseError) {
      console.log(`[Schedule] Body parse error:`, parseError);
      // No body or invalid JSON, use defaults
    }

    // If preview events were not provided, generate them using preview-engine
    // This ensures the same algorithm is used for both preview and apply
    if (!previewEvents || previewEvents.length === 0) {
      // Fetch all required data for scheduling
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

      // Resolve timezone
      const configuredTimezone = timezoneResult.data?.timezone || 'auto';
      const resolvedTimezone =
        configuredTimezone !== 'auto'
          ? configuredTimezone
          : Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Generate preview using the centralized algorithm
      const preview = generatePreview(
        habits,
        tasks,
        existingEvents,
        hourSettingsResult as HourSettings,
        {
          windowDays,
          timezone: resolvedTimezone,
        }
      );

      previewEvents = preview.events;
    }

    // Log for debugging
    console.log(
      `[Schedule] Processing ${previewEvents.length} preview events for ws ${wsId}`
    );

    // Now persist the preview events (whether provided or generated)
    return await createEventsFromPreview(
      supabase as any,
      wsId,
      previewEvents,
      windowDays
    );
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

/**
 * Apply preview events using min-max strategy
 *
 * Strategy: Prioritize UPDATING existing events over delete/insert
 * 1. Fetch all existing habit/task events in the window
 * 2. Match preview events with existing events by source_id + occurrence
 * 3. UPDATE matched events (reposition them)
 * 4. INSERT only when no existing event can be reused
 * 5. DELETE orphaned events that aren't in the preview
 *
 * This minimizes database writes and preserves event IDs where possible.
 */
async function createEventsFromPreview(
  supabase: any,
  wsId: string,
  previewEvents: PreviewEvent[],
  windowDays: number
) {
  const warnings: string[] = [];
  const stats = {
    updated: 0,
    created: 0,
    deleted: 0,
    reused: 0,
  };

  // Calculate the scheduling window
  const windowStart = new Date();
  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + windowDays);

  // ============================================================================
  // STEP 1: Fetch all existing scheduled events in the window
  // ============================================================================

  interface ExistingEvent {
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    habit_id: string | null;
    task_id: string | null;
    locked: boolean;
    color: string | null;
    occurrence_date?: string;
    junction_type?: 'habit' | 'task';
  }

  const existingEvents: ExistingEvent[] = [];
  const usedEventIds = new Set<string>();

  // Fetch habit events linked via junction table
  const { data: junctionHabitEvents } = await supabase
    .from('habit_calendar_events')
    .select(`
      habit_id,
      occurrence_date,
      event_id,
      workspace_calendar_events!inner(id, title, start_at, end_at, locked, color, ws_id)
    `)
    .eq('workspace_calendar_events.ws_id', wsId)
    .eq('workspace_calendar_events.locked', false)
    .gte('workspace_calendar_events.start_at', windowStart.toISOString())
    .lte('workspace_calendar_events.start_at', windowEnd.toISOString());

  if (junctionHabitEvents) {
    for (const link of junctionHabitEvents as any[]) {
      const event = link.workspace_calendar_events;
      if (!existingEvents.find((e) => e.id === event.id)) {
        existingEvents.push({
          id: event.id,
          title: event.title,
          start_at: event.start_at,
          end_at: event.end_at,
          habit_id: link.habit_id,
          task_id: null,
          locked: event.locked,
          color: event.color,
          occurrence_date: link.occurrence_date,
          junction_type: 'habit',
        });
      }
    }
  }

  // Fetch task events linked via junction table
  const { data: junctionTaskEvents } = await supabase
    .from('task_calendar_events')
    .select(`
      task_id,
      event_id,
      workspace_calendar_events!inner(id, title, start_at, end_at, locked, color, ws_id)
    `)
    .eq('workspace_calendar_events.ws_id', wsId)
    .eq('workspace_calendar_events.locked', false)
    .gte('workspace_calendar_events.start_at', windowStart.toISOString())
    .lte('workspace_calendar_events.start_at', windowEnd.toISOString());

  if (junctionTaskEvents) {
    for (const link of junctionTaskEvents as any[]) {
      const event = link.workspace_calendar_events;
      if (!existingEvents.find((e) => e.id === event.id)) {
        existingEvents.push({
          id: event.id,
          title: event.title,
          start_at: event.start_at,
          end_at: event.end_at,
          habit_id: null,
          task_id: link.task_id,
          locked: event.locked,
          color: event.color,
          junction_type: 'task',
        });
      }
    }
  }

  // Build lookup maps for efficient matching
  // For habits: group by habit_id, then by occurrence_date
  const habitEventsByIdAndDate = new Map<string, ExistingEvent[]>();
  // For tasks: group by task_id
  const taskEventsById = new Map<string, ExistingEvent[]>();

  for (const event of existingEvents) {
    if (event.habit_id) {
      const occurrenceDate =
        event.occurrence_date || event.start_at.split('T')[0];
      const key = `${event.habit_id}:${occurrenceDate}`;
      if (!habitEventsByIdAndDate.has(key)) {
        habitEventsByIdAndDate.set(key, []);
      }
      habitEventsByIdAndDate.get(key)!.push(event);
    } else if (event.task_id) {
      if (!taskEventsById.has(event.task_id)) {
        taskEventsById.set(event.task_id, []);
      }
      taskEventsById.get(event.task_id)!.push(event);
    }
  }

  // ============================================================================
  // STEP 2: Process preview events - UPDATE or INSERT
  // ============================================================================

  const resultEvents: Array<{
    id: string;
    type: 'habit' | 'task' | 'break';
    source_id: string;
    start_at: string;
    end_at: string;
    action: 'updated' | 'created';
  }> = [];

  let habitsScheduled = 0;
  let tasksScheduled = 0;
  const taskIdsScheduled = new Set<string>();

  for (const previewEvent of previewEvents) {
    // Log each event for debugging
    console.log(
      `[Schedule] Processing event: type=${previewEvent.type}, title="${previewEvent.title}", source_id=${previewEvent.source_id}`
    );

    const isHabit = previewEvent.type === 'habit';
    const isTask = previewEvent.type === 'task';
    const sourceId = previewEvent.source_id;
    const occurrenceDate =
      previewEvent.occurrence_date || previewEvent.start_at?.split('T')[0];

    // Validate required fields
    if (!previewEvent.start_at || !previewEvent.end_at || !previewEvent.title) {
      console.error(`[Schedule] Invalid event data:`, previewEvent);
      warnings.push(`Skipped invalid event: missing required fields`);
      continue;
    }

    let existingEvent: ExistingEvent | undefined;

    // Try to find an existing event to reuse
    if (isHabit) {
      const key = `${sourceId}:${occurrenceDate}`;
      const candidates = habitEventsByIdAndDate.get(key) || [];
      existingEvent = candidates.find((e) => !usedEventIds.has(e.id));
    } else if (isTask) {
      const candidates = taskEventsById.get(sourceId) || [];
      existingEvent = candidates.find((e) => !usedEventIds.has(e.id));
    }

    if (existingEvent && !usedEventIds.has(existingEvent.id)) {
      // ============================================================================
      // UPDATE existing event
      // ============================================================================
      usedEventIds.add(existingEvent.id);

      const needsUpdate =
        existingEvent.start_at !== previewEvent.start_at ||
        existingEvent.end_at !== previewEvent.end_at ||
        existingEvent.title !== previewEvent.title ||
        existingEvent.color !== (previewEvent.color || 'BLUE');

      if (needsUpdate) {
        const { error: updateError } = await supabase
          .from('workspace_calendar_events')
          .update({
            title: previewEvent.title,
            start_at: previewEvent.start_at,
            end_at: previewEvent.end_at,
            color: previewEvent.color || 'BLUE',
          })
          .eq('id', existingEvent.id);

        if (updateError) {
          console.error('Failed to update event:', updateError);
          warnings.push(`Failed to update event: ${previewEvent.title}`);
          continue;
        }
        stats.updated++;
      } else {
        stats.reused++;
      }

      // Update junction tables for habit/task links
      if (isHabit) {
        // Upsert habit junction record
        await supabase.from('habit_calendar_events').upsert(
          {
            habit_id: sourceId,
            event_id: existingEvent.id,
            occurrence_date: occurrenceDate,
          },
          { onConflict: 'event_id' }
        );
      }

      if (isTask) {
        const startTime = new Date(previewEvent.start_at).getTime();
        const endTime = new Date(previewEvent.end_at).getTime();
        const scheduledMinutes = Math.round((endTime - startTime) / 60000);

        // Upsert task junction record
        await supabase.from('task_calendar_events').upsert(
          {
            task_id: sourceId,
            event_id: existingEvent.id,
            scheduled_minutes: scheduledMinutes,
            completed: false,
          },
          { onConflict: 'event_id' }
        );
      }

      resultEvents.push({
        id: existingEvent.id,
        type: previewEvent.type,
        source_id: sourceId,
        start_at: previewEvent.start_at,
        end_at: previewEvent.end_at,
        action: needsUpdate ? 'updated' : 'updated', // Mark as updated even if reused
      });

      if (isHabit) habitsScheduled++;
      if (isTask) taskIdsScheduled.add(sourceId);
    } else {
      // ============================================================================
      // INSERT new event (no existing event to reuse)
      // ============================================================================
      console.log(
        `[Schedule] Creating new event: "${previewEvent.title}" (${previewEvent.type})`
      );

      const insertData = {
        title: previewEvent.title,
        start_at: previewEvent.start_at,
        end_at: previewEvent.end_at,
        ws_id: wsId,
        color: previewEvent.color || 'BLUE',
        locked: false, // Auto-scheduled events are not locked
      };

      const { data: newEvent, error: insertError } = await supabase
        .from('workspace_calendar_events')
        .insert(insertData)
        .select()
        .single();

      if (insertError) {
        console.error(
          `[Schedule] Failed to create event "${previewEvent.title}":`,
          insertError
        );
        console.error(`[Schedule] Insert data was:`, insertData);
        warnings.push(
          `Failed to create event: ${previewEvent.title} - ${insertError.message}`
        );
        continue;
      }

      stats.created++;

      // Create junction records for habit/task links
      if (isHabit) {
        await supabase.from('habit_calendar_events').insert({
          habit_id: sourceId,
          event_id: newEvent.id,
          occurrence_date: occurrenceDate,
        });
      }

      if (isTask) {
        const startTime = new Date(previewEvent.start_at).getTime();
        const endTime = new Date(previewEvent.end_at).getTime();
        const scheduledMinutes = Math.round((endTime - startTime) / 60000);

        await supabase.from('task_calendar_events').insert({
          task_id: sourceId,
          event_id: newEvent.id,
          scheduled_minutes: scheduledMinutes,
          completed: false,
        });
      }

      resultEvents.push({
        id: newEvent.id,
        type: previewEvent.type,
        source_id: sourceId,
        start_at: newEvent.start_at,
        end_at: newEvent.end_at,
        action: 'created',
      });

      if (isHabit) habitsScheduled++;
      if (isTask) taskIdsScheduled.add(sourceId);
    }
  }

  tasksScheduled = taskIdsScheduled.size;

  // ============================================================================
  // STEP 3: Delete orphaned events (existing events not in preview)
  // Only delete if we successfully processed at least some events
  // Otherwise, we might have hit an error and shouldn't delete everything
  // ============================================================================

  console.log(
    `[Schedule] Processed: ${resultEvents.length} events (${stats.created} created, ${stats.updated} updated, ${stats.reused} reused)`
  );

  const orphanedEventIds = existingEvents
    .filter((e) => !usedEventIds.has(e.id))
    .map((e) => e.id);

  // Safety check: only delete orphans if we actually processed some events
  // If resultEvents is empty but we expected events, something went wrong
  if (orphanedEventIds.length > 0 && resultEvents.length > 0) {
    // Delete junction records first (FK constraint)
    await supabase
      .from('habit_calendar_events')
      .delete()
      .in('event_id', orphanedEventIds);

    await supabase
      .from('task_calendar_events')
      .delete()
      .in('event_id', orphanedEventIds);

    // Delete the events
    const { error: deleteError } = await supabase
      .from('workspace_calendar_events')
      .delete()
      .in('id', orphanedEventIds);

    if (deleteError) {
      console.error('Failed to delete orphaned events:', deleteError);
      warnings.push('Failed to clean up orphaned events');
    } else {
      stats.deleted = orphanedEventIds.length;
    }
  } else if (orphanedEventIds.length > 0 && resultEvents.length === 0) {
    console.warn(
      `[Schedule] Skipping orphan deletion: 0 events processed but ${orphanedEventIds.length} orphans found. This might indicate an error.`
    );
    warnings.push('Orphan cleanup skipped due to processing issues');
  }

  // ============================================================================
  // STEP 4: Update scheduling metadata
  // ============================================================================

  const eventsTotal = resultEvents.length;

  try {
    await supabase.rpc('upsert_scheduling_metadata', {
      p_ws_id: wsId,
      p_status:
        warnings.length > 0
          ? eventsTotal === 0
            ? 'failed'
            : 'partial'
          : 'success',
      p_message:
        warnings.length > 0
          ? warnings.join('; ')
          : `Scheduled ${habitsScheduled} habits and ${tasksScheduled} tasks (${stats.updated} updated, ${stats.created} created, ${stats.deleted} removed)`,
      p_habits_scheduled: habitsScheduled,
      p_tasks_scheduled: tasksScheduled,
      p_events_created: eventsTotal,
      p_bumped_habits: 0,
      p_window_days: windowDays,
    });
  } catch (e) {
    console.error('Error updating scheduling metadata:', e);
  }

  return NextResponse.json({
    success: true,
    summary: {
      habitsScheduled,
      tasksScheduled,
      eventsTotal,
      eventsUpdated: stats.updated,
      eventsCreated: stats.created,
      eventsDeleted: stats.deleted,
      eventsReused: stats.reused,
      windowDays,
    },
    events: resultEvents,
    warnings,
  });
}
