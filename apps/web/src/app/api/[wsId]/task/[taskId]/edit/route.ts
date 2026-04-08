import { createClient } from '@tuturuuu/supabase/next/server';
import type { TablesInsert, TablesUpdate } from '@tuturuuu/types';
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

const editTaskBodySchema = z
  .object({
    priority: z
      .enum(VALID_PRIORITIES as [TaskPriority, ...TaskPriority[]])
      .optional(),
    total_duration: z.number().nonnegative().nullable().optional(),
    is_splittable: z.boolean().nullable().optional(),
    min_split_duration_minutes: z.number().nonnegative().nullable().optional(),
    max_split_duration_minutes: z.number().nonnegative().nullable().optional(),
    calendar_hours: z.enum(VALID_CALENDAR_HOURS).nullable().optional(),
    auto_schedule: z.boolean().nullable().optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const supabase = await createClient();
    const user = await getCurrentSupabaseUser();

    // 1. Authenticate the user
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse the request body
    const parsedBody = editTaskBodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      console.error('Validation error:', parsedBody.error);
      return NextResponse.json(
        {
          error: parsedBody.error.issues[0]?.message ?? 'Invalid request body',
        },
        { status: 400 }
      );
    }

    const body = parsedBody.data;

    // 3. Check if task exists and user has access to it
    const { data: existingTask, error: fetchError } = await supabase
      .from('tasks')
      .select('id, creator_id, name')
      .eq('id', taskId)
      .single();

    if (fetchError || !existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // 4. Check if user has permission to edit this task
    const { data: taskAssignee } = await supabase
      .from('task_assignees')
      .select('user_id')
      .eq('task_id', taskId)
      .eq('user_id', user.id)
      .single();

    if (!taskAssignee && existingTask.creator_id !== user.id) {
      return NextResponse.json(
        { error: 'You do not have permission to edit this task' },
        { status: 403 }
      );
    }

    // 5. Build update objects with validated fields
    const taskUpdateData: TablesUpdate<'tasks'> = {};
    const schedulingUpdateData: TablesUpdate<'task_user_scheduling_settings'> =
      {};

    // Priority
    if (body.priority !== undefined) {
      taskUpdateData.priority = body.priority;
    }

    // Scheduling fields (per-user: task_user_scheduling_settings)
    if (body.total_duration !== undefined) {
      schedulingUpdateData.total_duration = body.total_duration;
    }

    if (body.is_splittable !== undefined) {
      schedulingUpdateData.is_splittable = body.is_splittable ?? false;
    }

    if (body.min_split_duration_minutes !== undefined) {
      schedulingUpdateData.min_split_duration_minutes =
        body.min_split_duration_minutes;
    }

    if (body.max_split_duration_minutes !== undefined) {
      schedulingUpdateData.max_split_duration_minutes =
        body.max_split_duration_minutes;
    }

    if (body.calendar_hours !== undefined) {
      schedulingUpdateData.calendar_hours = body.calendar_hours;
    }

    if (body.auto_schedule !== undefined) {
      schedulingUpdateData.auto_schedule = body.auto_schedule ?? false;
    }

    // Check if there's anything to update
    if (
      Object.keys(taskUpdateData).length === 0 &&
      Object.keys(schedulingUpdateData).length === 0
    ) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // 6. Apply updates
    if (Object.keys(taskUpdateData).length > 0) {
      const { error: updateError } = await supabase
        .from('tasks')
        .update(taskUpdateData)
        .eq('id', taskId);

      if (updateError) {
        console.error('Error updating task:', updateError);
        return NextResponse.json(
          { error: 'Failed to update task' },
          { status: 500 }
        );
      }
    }

    if (Object.keys(schedulingUpdateData).length > 0) {
      const schedulingUpsertData: TablesInsert<'task_user_scheduling_settings'> =
        {
          task_id: taskId,
          user_id: user.id,
          ...schedulingUpdateData,
        };
      const { error: schedulingError } = await (supabase as any)
        .from('task_user_scheduling_settings')
        .upsert(schedulingUpsertData, {
          onConflict: 'task_id,user_id',
        });

      if (schedulingError) {
        console.error(
          'Error updating task_user_scheduling_settings:',
          schedulingError
        );
        return NextResponse.json(
          { error: 'Failed to update task scheduling settings' },
          { status: 500 }
        );
      }
    }

    const { data: updatedTask, error: fetchUpdatedError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (fetchUpdatedError || !updatedTask) {
      return NextResponse.json(
        { error: 'Failed to fetch updated task' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedTask, { status: 200 });
  } catch (e: unknown) {
    console.error('Error in task edit route:', e);
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
