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

import { createClient } from '@tuturuuu/supabase/next/server';
import type { TaskWithScheduling } from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type { Habit } from '@tuturuuu/types/primitives/Habit';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';
import { fetchHourSettings } from '@/lib/calendar/task-scheduler';
import {
  generatePreview,
  type HourSettings,
  type PreviewEvent,
} from '@/lib/calendar/unified-scheduler/preview-engine';
import {
  decryptField,
  encryptEventForStorage,
  getWorkspaceKey,
} from '@/lib/workspace-encryption';

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

    // Check for cron secret authorization (for background jobs)
    const cronSecret =
      process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';
    const authHeader = request.headers.get('Authorization');
    const isCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

    // Workspace mode detection (personal vs workspace)
    const { data: workspaceInfo } = await supabase
      .from('workspaces')
      .select('personal')
      .eq('id', wsId)
      .maybeSingle();
    const isPersonalWorkspace = !!workspaceInfo?.personal;

    // If not cron auth, require user authentication
    let currentUserId: string | null = null;
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
      currentUserId = user.id;

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
    } else if (isPersonalWorkspace) {
      // Personal scheduling is user-scoped and must not run via cron.
      return NextResponse.json(
        { error: 'Personal workspace scheduling requires a signed-in user' },
        { status: 401 }
      );
    }

    // Parse optional body for options
    let windowDays = 30;
    let previewEvents: PreviewEvent[] | undefined;
    let clientTimezone: string | undefined;
    try {
      const body = await request.json();
      if (body.windowDays && typeof body.windowDays === 'number') {
        windowDays = Math.min(Math.max(body.windowDays, 7), 90); // Limit 7-90 days
      }
      if (typeof body.clientTimezone === 'string') {
        clientTimezone = body.clientTimezone;
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

      const [hourSettingsResult, habitsResult, eventsResult, timezoneResult] =
        await Promise.all([
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

      const tasksResult = isPersonalWorkspace
        ? await (async () => {
            if (!currentUserId) return { data: [], error: null };
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
              .eq('user_id', currentUserId)
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
          })()
        : await (async () => {
            if (!currentUserId) return { data: [], error: null };
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
              .eq('user_id', currentUserId)
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
          })();

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
      // - If workspace timezone is auto/unset:
      //   - Cron/background: reject (requires fixed timezone)
      //   - User-initiated: require clientTimezone (browser)
      const configuredTimezone = timezoneResult.data?.timezone || 'auto';
      const needsClientTimezone =
        !configuredTimezone || configuredTimezone === 'auto';
      const resolvedTimezone = !needsClientTimezone
        ? configuredTimezone
        : (() => {
            if (isCronAuth) {
              throw new Error(
                'Workspace timezone is set to auto. Please set a fixed workspace timezone to enable background scheduling.'
              );
            }
            if (!clientTimezone || !isValidTz(clientTimezone)) {
              throw new Error(
                'Workspace timezone is not set. Please set a fixed workspace timezone before using Smart Schedule.'
              );
            }
            return clientTimezone;
          })();

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
    if (
      error instanceof Error &&
      (error.message.startsWith('Workspace timezone is not set') ||
        error.message.startsWith('Workspace timezone is set to auto'))
    ) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
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

    const { data: wsInfo } = await supabase
      .from('workspaces')
      .select('personal')
      .eq('id', wsId)
      .maybeSingle();
    const isPersonalWorkspace = !!wsInfo?.personal;

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
      // Tasks are always per-user via `task_user_scheduling_settings`.
      (supabase as any)
        .from('task_user_scheduling_settings')
        .select(
          `
          task_id,
          tasks!inner(
            task_lists!inner(
              workspace_boards!inner(ws_id)
            )
          )
        `,
          { count: 'exact' }
        )
        .eq('user_id', user.id)
        .eq('tasks.task_lists.workspace_boards.ws_id', wsId)
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
      mode: isPersonalWorkspace ? 'personal' : 'workspace',
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

  // Get workspace encryption key (if encryption is enabled)
  const workspaceKey = await getWorkspaceKey(wsId);

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
    is_encrypted: boolean | null;
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
      workspace_calendar_events!inner(id, title, start_at, end_at, locked, color, is_encrypted, ws_id)
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
          is_encrypted: event.is_encrypted,
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
      workspace_calendar_events!inner(id, title, start_at, end_at, locked, color, is_encrypted, ws_id)
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
          is_encrypted: event.is_encrypted,
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

    // IMPORTANT: Do NOT update events that have already started
    // Events that started before "now" should not be moved - create new ones instead
    if (existingEvent) {
      const existingEventStart = new Date(existingEvent.start_at);
      if (existingEventStart < windowStart) {
        console.log(
          `[Schedule] Skipping in-progress/past event "${existingEvent.title}" (started ${existingEvent.start_at}) - will create new event instead`
        );
        existingEvent = undefined; // Force creation of new event
      }
    }

    if (existingEvent && !usedEventIds.has(existingEvent.id)) {
      // ============================================================================
      // UPDATE existing event
      // ============================================================================
      usedEventIds.add(existingEvent.id);

      // Compare titles correctly based on encryption status
      // For encrypted events: decrypt both and compare plaintext
      // For plaintext events: compare directly
      let titleMatches = false;
      if (existingEvent.is_encrypted && workspaceKey) {
        // Decrypt both titles and compare plaintext
        try {
          const decryptedExisting = decryptField(
            existingEvent.title || '',
            workspaceKey
          );
          // Preview title is already plaintext, compare directly
          titleMatches = decryptedExisting === previewEvent.title;
        } catch {
          // On decryption error, fall back to assuming titles don't match
          // This ensures the event gets updated with fresh encryption
          titleMatches = false;
        }
      } else {
        // Compare plaintext titles directly
        titleMatches = existingEvent.title === previewEvent.title;
      }

      const needsUpdate =
        existingEvent.start_at !== previewEvent.start_at ||
        existingEvent.end_at !== previewEvent.end_at ||
        !titleMatches ||
        existingEvent.color !== (previewEvent.color || 'BLUE');

      if (needsUpdate) {
        // Encrypt the event data if encryption is enabled
        const eventData = await encryptEventForStorage(
          wsId,
          {
            title: previewEvent.title,
            description: '', // Schedule events don't have descriptions
            start_at: previewEvent.start_at,
            end_at: previewEvent.end_at,
            color: previewEvent.color || 'BLUE',
          },
          workspaceKey
        );

        const { error: updateError } = await supabase
          .from('workspace_calendar_events')
          .update({
            title: eventData.title,
            start_at: eventData.start_at,
            end_at: eventData.end_at,
            color: eventData.color || 'BLUE',
            is_encrypted: eventData.is_encrypted,
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

      // Encrypt the event data if encryption is enabled
      const eventData = await encryptEventForStorage(
        wsId,
        {
          title: previewEvent.title,
          description: '', // Schedule events don't have descriptions
          start_at: previewEvent.start_at,
          end_at: previewEvent.end_at,
          color: previewEvent.color || 'BLUE',
        },
        workspaceKey
      );

      const insertData = {
        title: eventData.title,
        start_at: eventData.start_at,
        end_at: eventData.end_at,
        ws_id: wsId,
        color: eventData.color || 'BLUE',
        locked: false, // Auto-scheduled events are not locked
        is_encrypted: eventData.is_encrypted,
      };

      const { data: newEvent, error: insertError } = await supabase
        .from('workspace_calendar_events')
        .insert(insertData)
        .select()
        .single();

      if (insertError) {
        console.error('[Schedule] Failed to create event', {
          title: previewEvent.title,
          error: insertError,
        });
        console.error('[Schedule] Insert data was:', insertData);
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
    // Only delete TASK events, not habit events - habits should be preserved
    .filter((e) => e.junction_type !== 'habit')
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
