import { createClient } from '@ncthub/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') || '100'),
      200
    );
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Fetch tasks from all boards in the workspace
    const { data, error } = await supabase
      .from('tasks')
      .select(
        `
        id,
        name,
        description,
        priority,
        completed,
        start_date,
        end_date,
        created_at,
        list_id,
        task_lists!inner (
          id,
          name,
          board_id,
          workspace_boards!inner (
            id,
            name,
            ws_id
          )
        )
      `
      )
      .eq('task_lists.workspace_boards.ws_id', wsId)
      .eq('deleted', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Transform the data to match the expected WorkspaceTask format
    const tasks =
      data?.map((task: any) => ({
        id: task.id,
        name: task.name,
        description: task.description,
        priority: task.priority,
        completed: task.completed,
        start_date: task.start_date,
        end_date: task.end_date,
        created_at: task.created_at,
        list_id: task.list_id,
        // Add board information for context
        board_name: task.task_lists?.workspace_boards?.name,
        list_name: task.task_lists?.name,
      })) || [];

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
