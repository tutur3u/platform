import { createClient } from '@tuturuuu/supabase/next/server';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { NextResponse } from 'next/server';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const { wsId, taskId } = await params;
    const supabase = await createClient();
    const user = await getCurrentSupabaseUser();

    // 1. Authenticate the user
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate the request body
    const body = await req.json();
    const { priority } = body;

    // Define valid priority type
    const validPriorities: TaskPriority[] = [
      'critical',
      'high',
      'normal',
      'low',
    ];

    // Validate priority
    if (!priority || typeof priority !== 'string') {
      return NextResponse.json(
        { error: 'Priority is required and must be a string' },
        { status: 400 }
      );
    }

    if (!validPriorities.includes(priority as TaskPriority)) {
      return NextResponse.json(
        { error: `Priority must be one of: ${validPriorities.join(', ')}` },
        { status: 400 }
      );
    }

    const validatedPriority = priority as TaskPriority;

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

    // 5. Update task priority
    const { data: updatedTask, error: updateError } = await supabase
      .from('tasks')
      .update({ priority: validatedPriority })
      .eq('id', taskId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating task:', updateError);
      return NextResponse.json(
        { error: 'Failed to update task' },
        { status: 500 }
      );
    }

    // 6. Update priority in related calendar events
    const { error: calendarUpdateError } = await supabase
      .from('workspace_calendar_events')
      .update({ priority: validatedPriority })
      .eq('ws_id', wsId)
      .eq('task_id', taskId);

    if (calendarUpdateError) {
      console.error('Error updating calendar events:', calendarUpdateError);
      // Log the error but don't fail the request since the main task update succeeded
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
