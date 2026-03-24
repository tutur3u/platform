import {
  prepareTaskChunks,
  scheduleTasks,
} from '@tuturuuu/ai/scheduling/algorithm';
import { defaultActiveHours } from '@tuturuuu/ai/scheduling/default';
import type { Task } from '@tuturuuu/ai/scheduling/types';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Calendar hours type for task scheduling (matches database enum)
type CalendarHoursType = 'work_hours' | 'personal_hours' | 'meeting_hours';

// Valid values for validation
const VALID_PRIORITIES: TaskPriority[] = ['critical', 'high', 'normal', 'low'];
const VALID_CALENDAR_HOURS: CalendarHoursType[] = [
  'work_hours',
  'personal_hours',
  'meeting_hours',
];

const createTaskBodySchema = z
  .object({
    name: z.string().trim().min(1, 'Task name is required'),
    description: z.string().optional().nullable(),
    total_duration: z
      .number()
      .positive('Total duration must be a positive number'),
    is_splittable: z.boolean().optional(),
    min_split_duration_minutes: z.number().nonnegative().optional().nullable(),
    max_split_duration_minutes: z.number().nonnegative().optional().nullable(),
    calendar_hours: z.enum(VALID_CALENDAR_HOURS).optional().nullable(),
    auto_schedule: z.boolean().optional(),
    start_date: z.string().optional().nullable(),
    end_date: z.string().optional().nullable(),
    priority: z.enum(VALID_PRIORITIES).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.is_splittable &&
      data.min_split_duration_minutes != null &&
      data.max_split_duration_minutes != null &&
      data.min_split_duration_minutes > data.max_split_duration_minutes
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Minimum split duration cannot be greater than maximum',
        path: ['min_split_duration_minutes'],
      });
    }
  });

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
    const parsedBody = createTaskBodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: parsedBody.error.issues[0]?.message ?? 'Invalid request body',
        },
        { status: 400 }
      );
    }

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
    } = parsedBody.data;

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
      await supabase.from('task_user_scheduling_settings').upsert(
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
