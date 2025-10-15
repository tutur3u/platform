import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{
    wsId: string;
    taskId: string;
  }>;
}

// PATCH - Update task estimation points
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { wsId, taskId } = await params;
    const body = await request.json();
    const { estimation_points } = body;

    // Validate estimation_points (should be between 0 and 8, or null)
    if (
      estimation_points !== null &&
      estimation_points !== undefined &&
      (typeof estimation_points !== 'number' ||
        estimation_points < 0 ||
        estimation_points > 8 ||
        !Number.isInteger(estimation_points))
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid estimation points. Must be an integer between 0 and 8, or null.',
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has access to the workspace
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Verify the task exists and belongs to the workspace, and get board estimation config
    const { data: task } = await supabase
      .from('tasks')
      .select(`
        id,
        estimation_points,
        list_id,
        task_lists!inner(
          board_id,
          workspace_boards!inner(
            ws_id,
            estimation_type,
            extended_estimation,
            allow_zero_estimates
          )
        )
      `)
      .eq('id', taskId)
      .eq('task_lists.workspace_boards.ws_id', wsId)
      .is('deleted_at', null)
      .single();

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const boardConfig = task.task_lists.workspace_boards;

    // Check if estimation is configured for this board
    if (!boardConfig.estimation_type) {
      return NextResponse.json(
        { error: 'Estimation is not configured for this board' },
        { status: 400 }
      );
    }

    // Validate estimation points against board configuration
    if (estimation_points !== null && estimation_points !== undefined) {
      // Check if zero estimates are allowed
      if (estimation_points === 0 && !boardConfig.allow_zero_estimates) {
        return NextResponse.json(
          { error: 'Zero estimates are not allowed for this board' },
          { status: 400 }
        );
      }

      // Check extended estimation limit
      const maxPoints = boardConfig.extended_estimation ? 8 : 5;
      if (estimation_points > maxPoints) {
        return NextResponse.json(
          {
            error: `Estimation points cannot exceed ${maxPoints} for this board configuration`,
          },
          { status: 400 }
        );
      }
    }

    // Update the task estimation points
    const { data: updatedTask, error: updateError } = await supabase
      .from('tasks')
      .update({
        estimation_points: estimation_points,
      })
      .eq('id', taskId)
      .select('id, estimation_points')
      .single();

    if (updateError) {
      console.error('Error updating task estimation points:', updateError);
      return NextResponse.json(
        { error: 'Failed to update estimation points' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedTask);
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
