import { createClient } from '@tuturuuu/supabase/next/server';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { NextResponse } from 'next/server';

// Calendar hours type for task scheduling (matches database enum)
type CalendarHoursType = 'work_hours' | 'personal_hours' | 'meeting_hours';

// Valid values for validation
const VALID_PRIORITIES: TaskPriority[] = ['critical', 'high', 'normal', 'low'];
const VALID_CALENDAR_HOURS: CalendarHoursType[] = [
  'work_hours',
  'personal_hours',
  'meeting_hours',
];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
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
    const body = await req.json();

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
    const taskUpdateData: Record<string, unknown> = {};
    const schedulingUpdateData: Record<string, unknown> = {};

    // Priority
    if (body.priority !== undefined) {
      if (
        typeof body.priority !== 'string' ||
        !VALID_PRIORITIES.includes(body.priority as TaskPriority)
      ) {
        return NextResponse.json(
          { error: `Priority must be one of: ${VALID_PRIORITIES.join(', ')}` },
          { status: 400 }
        );
      }
      taskUpdateData.priority = body.priority;
    }

    // Scheduling fields (per-user: task_user_scheduling_settings)
    if (body.total_duration !== undefined) {
      if (typeof body.total_duration !== 'number' || body.total_duration < 0) {
        return NextResponse.json(
          { error: 'total_duration must be a non-negative number' },
          { status: 400 }
        );
      }
      schedulingUpdateData.total_duration = body.total_duration;
    }

    if (body.is_splittable !== undefined) {
      if (typeof body.is_splittable !== 'boolean') {
        return NextResponse.json(
          { error: 'is_splittable must be a boolean' },
          { status: 400 }
        );
      }
      schedulingUpdateData.is_splittable = body.is_splittable;
    }

    if (body.min_split_duration_minutes !== undefined) {
      if (
        typeof body.min_split_duration_minutes !== 'number' ||
        body.min_split_duration_minutes < 0
      ) {
        return NextResponse.json(
          { error: 'min_split_duration_minutes must be a non-negative number' },
          { status: 400 }
        );
      }
      schedulingUpdateData.min_split_duration_minutes =
        body.min_split_duration_minutes;
    }

    if (body.max_split_duration_minutes !== undefined) {
      if (
        typeof body.max_split_duration_minutes !== 'number' ||
        body.max_split_duration_minutes < 0
      ) {
        return NextResponse.json(
          { error: 'max_split_duration_minutes must be a non-negative number' },
          { status: 400 }
        );
      }
      schedulingUpdateData.max_split_duration_minutes =
        body.max_split_duration_minutes;
    }

    if (body.calendar_hours !== undefined) {
      if (
        body.calendar_hours !== null &&
        (typeof body.calendar_hours !== 'string' ||
          !VALID_CALENDAR_HOURS.includes(
            body.calendar_hours as CalendarHoursType
          ))
      ) {
        return NextResponse.json(
          {
            error: `calendar_hours must be one of: ${VALID_CALENDAR_HOURS.join(', ')} or null`,
          },
          { status: 400 }
        );
      }
      schedulingUpdateData.calendar_hours = body.calendar_hours;
    }

    if (body.auto_schedule !== undefined) {
      if (typeof body.auto_schedule !== 'boolean') {
        return NextResponse.json(
          { error: 'auto_schedule must be a boolean' },
          { status: 400 }
        );
      }
      schedulingUpdateData.auto_schedule = body.auto_schedule;
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
      const { error: schedulingError } = await (supabase as any)
        .from('task_user_scheduling_settings')
        .upsert(
          {
            task_id: taskId,
            user_id: user.id,
            ...schedulingUpdateData,
          },
          {
            onConflict: 'task_id,user_id',
          }
        );

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
