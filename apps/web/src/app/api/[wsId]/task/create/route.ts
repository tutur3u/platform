import {
  prepareTaskChunks,
  scheduleTasks,
} from '@tuturuuu/ai/scheduling/algorithm';
import { defaultActiveHours } from '@tuturuuu/ai/scheduling/default';
import type { Task } from '@tuturuuu/ai/scheduling/types';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { NextResponse } from 'next/server';

type CalendarHoursType = 'work_hours' | 'personal_hours' | 'meeting_hours';
const VALID_CALENDAR_HOURS: CalendarHoursType[] = [
  'work_hours',
  'personal_hours',
  'meeting_hours',
];
const VALID_PRIORITIES = ['critical', 'high', 'normal', 'low'] as const;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();
    const user = await getCurrentSupabaseUser();

    // 1. Authenticate the user
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate the request body
    const body = await req.json();
    const {
      name,
      description,
      total_duration,
      is_splittable,
      min_split_duration_minutes,
      max_split_duration_minutes,
      calendar_hours,
      auto_schedule,
      start_date,
      end_date,
      priority,
    } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Task name is required' },
        { status: 400 }
      );
    }

    if (typeof total_duration !== 'number' || total_duration <= 0) {
      return NextResponse.json(
        { error: 'Total duration must be a positive number' },
        { status: 400 }
      );
    }

    if (is_splittable) {
      if (min_split_duration_minutes > max_split_duration_minutes) {
        return NextResponse.json(
          { error: 'Minimum split duration cannot be greater than maximum' },
          { status: 400 }
        );
      }
    }

    if (
      calendar_hours !== undefined &&
      calendar_hours !== null &&
      (typeof calendar_hours !== 'string' ||
        !VALID_CALENDAR_HOURS.includes(calendar_hours as CalendarHoursType))
    ) {
      return NextResponse.json(
        {
          error: `calendar_hours must be one of: ${VALID_CALENDAR_HOURS.join(', ')} or null`,
        },
        { status: 400 }
      );
    }

    if (priority !== undefined) {
      if (
        typeof priority !== 'string' ||
        !(VALID_PRIORITIES as readonly string[]).includes(priority)
      ) {
        return NextResponse.json(
          {
            error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}`,
          },
          { status: 400 }
        );
      }
    }

    if (auto_schedule !== undefined && typeof auto_schedule !== 'boolean') {
      return NextResponse.json(
        { error: 'auto_schedule must be a boolean' },
        { status: 400 }
      );
    }

    // 3. Prepare task data for insertion
    const taskToInsert = {
      creator_id: user.id,
      name: name.trim(),
      description: description?.trim() || null,
      start_date: start_date || null,
      end_date: end_date || null,
      priority: priority || 'normal',
    };

    // 4. Insert task into Supabase
    const { data: dbTask, error: taskInsertError } = await supabase
      .from('tasks')
      .insert(taskToInsert)
      .select()
      .single();

    if (taskInsertError) {
      console.error('Supabase error creating task:', taskInsertError);
      return NextResponse.json(
        { error: 'Failed to create task in database.' },
        { status: 500 }
      );
    }

    // Scheduling settings are per-user (task_user_scheduling_settings), not stored on tasks.
    // Best-effort: task creation shouldn't fail due to missing RLS/rollout.
    try {
      await (supabase as any).from('task_user_scheduling_settings').upsert(
        {
          task_id: dbTask.id,
          user_id: user.id,
          total_duration,
          is_splittable: !!is_splittable,
          min_split_duration_minutes: is_splittable
            ? min_split_duration_minutes
            : null,
          max_split_duration_minutes: is_splittable
            ? max_split_duration_minutes
            : null,
          calendar_hours: calendar_hours ?? null,
          auto_schedule: auto_schedule ?? true,
        },
        {
          onConflict: 'task_id,user_id',
        }
      );
    } catch (settingsError) {
      console.warn(
        'Task created but failed to upsert task_user_scheduling_settings:',
        settingsError
      );
    }

    const { error: assignError } = await supabase
      .from('task_assignees')
      .insert({
        task_id: dbTask.id,
        user_id: user.id,
      });

    if (assignError) {
      console.error('Error assigning task to creator:', assignError);
    }

    // 5. Convert task to chunkable format
    // NOTE: task scheduling settings are per-user now (task_user_scheduling_settings).
    // Use the provided scheduling settings to schedule calendar events.
    const durationHours = total_duration;
    const minDurationHours = is_splittable
      ? Math.max(0, (min_split_duration_minutes ?? 0) / 60)
      : durationHours;
    const maxDurationHours = is_splittable
      ? Math.max(minDurationHours, (max_split_duration_minutes ?? 0) / 60)
      : durationHours;

    const taskToSplit: Task = {
      id: dbTask.id,
      name: dbTask.name,
      duration: durationHours,
      minDuration: minDurationHours,
      maxDuration: maxDurationHours,
      priority: dbTask.priority || 'normal',
      category: 'work',
    };

    const taskChunks = prepareTaskChunks([taskToSplit]);
    console.log('Prepared task chunks:', taskChunks);

    const { events: newScheduledEvents } = scheduleTasks(
      taskChunks,
      defaultActiveHours
    );

    if (newScheduledEvents.length > 0) {
      const insertData = newScheduledEvents.map((event) => ({
        ws_id: wsId,
        task_id: event.taskId,
        title: event.name,
        start_at: event.range.start.toISOString(),
        end_at: event.range.end.toISOString(),
        locked: false,
      }));

      const { error: insertError } = await supabase
        .from('workspace_calendar_events')
        .upsert(insertData);

      if (insertError) {
        console.error('Error inserting event:', insertError);
        return NextResponse.json(
          { error: 'Failed to insert event into calendar.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(dbTask, { status: 201 });
  } catch (e: unknown) {
    console.error('Error in task creation route:', e);
    if (e instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
