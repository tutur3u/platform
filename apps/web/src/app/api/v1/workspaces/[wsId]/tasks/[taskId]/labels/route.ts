import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{
    wsId: string;
    taskId: string;
  }>;
}

// GET - Fetch all labels for a task
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { wsId, taskId } = await params;
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

    // Verify the task exists and belongs to the workspace
    const { data: task } = await supabase
      .from('tasks')
      .select(`
        id,
        list_id,
        task_lists!inner(
          board_id,
          workspace_boards!inner(
            ws_id
          )
        )
      `)
      .eq('id', taskId)
      .eq('task_lists.workspace_boards.ws_id', wsId)
      .eq('deleted', false)
      .single();

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Fetch task labels with label details
    const { data: taskLabels, error } = await supabase
      .from('task_labels')
      .select(`
        label_id,
        workspace_task_labels!inner(
          id,
          name,
          color,
          created_at
        )
      `)
      .eq('task_id', taskId);

    if (error) {
      console.error('Error fetching task labels:', error);
      return NextResponse.json(
        { error: 'Failed to fetch task labels' },
        { status: 500 }
      );
    }

    const labels = taskLabels?.map((tl) => tl.workspace_task_labels) || [];
    return NextResponse.json(labels);
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Assign a label to a task
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { wsId, taskId } = await params;
    const body = await request.json();
    const { label_id } = body;

    if (!label_id) {
      return NextResponse.json(
        { error: 'Label ID is required' },
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

    // Verify the task exists and belongs to the workspace
    const { data: task } = await supabase
      .from('tasks')
      .select(`
        id,
        list_id,
        task_lists!inner(
          board_id,
          workspace_boards!inner(
            ws_id
          )
        )
      `)
      .eq('id', taskId)
      .eq('task_lists.workspace_boards.ws_id', wsId)
      .eq('deleted', false)
      .single();

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Verify the label exists and belongs to the workspace
    const { data: label } = await supabase
      .from('workspace_task_labels')
      .select('id, ws_id')
      .eq('id', label_id)
      .eq('ws_id', wsId)
      .single();

    if (!label) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 });
    }

    // Check if assignment already exists
    const { data: existingAssignment } = await supabase
      .from('task_labels')
      .select('task_id, label_id')
      .eq('task_id', taskId)
      .eq('label_id', label_id)
      .single();

    if (existingAssignment) {
      return NextResponse.json(
        { error: 'Label already assigned to task' },
        { status: 409 }
      );
    }

    // Create the assignment
    const { error: assignError } = await supabase.from('task_labels').insert({
      task_id: taskId,
      label_id: label_id,
    });

    if (assignError) {
      console.error('Error assigning label to task:', assignError);
      return NextResponse.json(
        { error: 'Failed to assign label to task' },
        { status: 500 }
      );
    }

    // Return the label details
    const { data: labelDetails } = await supabase
      .from('workspace_task_labels')
      .select('id, name, color, created_at')
      .eq('id', label_id)
      .single();

    return NextResponse.json(labelDetails, { status: 201 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a label from a task
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { wsId, taskId } = await params;
    const { searchParams } = new URL(request.url);
    const labelId = searchParams.get('label_id');

    if (!labelId) {
      return NextResponse.json(
        { error: 'Label ID is required' },
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

    // Verify the task exists and belongs to the workspace
    const { data: task } = await supabase
      .from('tasks')
      .select(`
        id,
        list_id,
        task_lists!inner(
          board_id,
          workspace_boards!inner(
            ws_id
          )
        )
      `)
      .eq('id', taskId)
      .eq('task_lists.workspace_boards.ws_id', wsId)
      .eq('deleted', false)
      .single();

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Remove the assignment
    const { error: removeError } = await supabase
      .from('task_labels')
      .delete()
      .eq('task_id', taskId)
      .eq('label_id', labelId);

    if (removeError) {
      console.error('Error removing label from task:', removeError);
      return NextResponse.json(
        { error: 'Failed to remove label from task' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
