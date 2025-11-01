import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';

interface TaskParams {
  wsId: string;
  taskId: string;
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<TaskParams> }
) {
  try {
    const { wsId, taskId } = await params;

    // Validate UUIDs
    if (!validate(wsId) || !validate(taskId)) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
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
        { error: 'Please sign in to permanently delete tasks' },
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

    // Verify task exists, belongs to workspace, and is already soft-deleted
    const { data: task, error: taskCheckError } = await supabase
      .from('tasks')
      .select(
        `
        id,
        deleted_at,
        list_id,
        task_lists!inner (
          id,
          workspace_boards!inner (
            ws_id
          )
        )
      `
      )
      .eq('id', taskId)
      .single();

    if (taskCheckError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Verify task belongs to the specified workspace
    if (task.task_lists?.workspace_boards?.ws_id !== wsId) {
      return NextResponse.json(
        { error: 'Task does not belong to this workspace' },
        { status: 403 }
      );
    }

    // Only allow permanent deletion if task is already soft-deleted
    if (!task.deleted_at) {
      return NextResponse.json(
        {
          error:
            'Task must be moved to trash first. Please move the task to trash before permanently deleting it.',
        },
        { status: 400 }
      );
    }

    // Permanently delete the task from database
    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (deleteError) {
      console.error('Supabase error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to permanently delete task' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Task permanently deleted',
    });
  } catch (error) {
    console.error('Error permanently deleting task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<TaskParams> }
) {
  try {
    const { wsId, taskId } = await params;

    // Validate UUIDs
    if (!validate(wsId) || !validate(taskId)) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
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
        { error: 'Please sign in to restore tasks' },
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

    const body = await request.json();
    const { restore } = body;

    if (restore !== true) {
      return NextResponse.json(
        { error: 'Invalid request. Use restore: true to restore a task' },
        { status: 400 }
      );
    }

    // Verify task exists and belongs to workspace
    const { data: task, error: taskCheckError } = await supabase
      .from('tasks')
      .select(
        `
        id,
        deleted_at,
        list_id,
        task_lists!inner (
          id,
          workspace_boards!inner (
            ws_id
          )
        )
      `
      )
      .eq('id', taskId)
      .single();

    if (taskCheckError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Verify task belongs to the specified workspace
    if (task.task_lists?.workspace_boards?.ws_id !== wsId) {
      return NextResponse.json(
        { error: 'Task does not belong to this workspace' },
        { status: 403 }
      );
    }

    if (!task.deleted_at) {
      return NextResponse.json(
        { error: 'Task is not in trash' },
        { status: 400 }
      );
    }

    // Restore the task by setting deleted_at to null
    const { error: restoreError } = await supabase
      .from('tasks')
      .update({ deleted_at: null })
      .eq('id', taskId);

    if (restoreError) {
      console.error('Supabase error:', restoreError);
      return NextResponse.json(
        { error: 'Failed to restore task' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Task restored successfully',
    });
  } catch (error) {
    console.error('Error restoring task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
