import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';

interface TaskParams {
  wsId: string;
  taskId: string;
}

export async function POST(
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
        { error: 'Please sign in to move tasks to trash' },
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

    // Check if already in trash
    if (task.deleted_at) {
      return NextResponse.json(
        { error: 'Task is already in trash' },
        { status: 400 }
      );
    }

    // Soft delete the task by setting deleted_at timestamp
    const { error: deleteError } = await supabase
      .from('tasks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', taskId);

    if (deleteError) {
      console.error('Supabase error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to move task to trash' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Task moved to trash successfully',
    });
  } catch (error) {
    console.error('Error moving task to trash:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
