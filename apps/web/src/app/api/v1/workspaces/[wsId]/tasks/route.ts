import { createClient } from '@tuturuuu/supabase/next/server';
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
    const boardId = url.searchParams.get('boardId');
    const listId = url.searchParams.get('listId');

    // Build the query for fetching tasks with assignee information
    let query = supabase
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
        task_lists (
          id,
          name,
          board_id,
          workspace_boards (
            id,
            name,
            ws_id
          )
        ),
        assignees:task_assignees(
          user:users(
            id,
            display_name,
            avatar_url
          )
        )
      `
      )
      .eq('task_lists.workspace_boards.ws_id', wsId)
      .eq('deleted', false);

    // Apply filters based on query parameters
    if (listId) {
      query = query.eq('list_id', listId);
    } else if (boardId) {
      query = query.eq('task_lists.board_id', boardId);
    }

    // Apply ordering and pagination
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Database error in tasks query:', error);
      throw error;
    }

    // Handle case where no tasks exist or workspace has no boards/lists
    if (!data) {
      return NextResponse.json({ tasks: [] });
    }

    // Transform the data to match the expected WorkspaceTask format
    const tasks =
      data
        ?.filter((task: any) => {
          // Filter out tasks that don't belong to this workspace
          return task.task_lists?.workspace_boards?.ws_id === wsId;
        })
        ?.map((task: any) => ({
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
          // Add assignee information
          assignees:
            task.assignees
              ?.map((a: any) => a.user)
              .filter(
                (user: any, index: number, self: any[]) =>
                  user &&
                  user.id &&
                  self.findIndex((u: any) => u.id === user.id) === index
              ) || [],
          // Add helper field to identify if current user is assigned
          is_assigned_to_current_user:
            task.assignees?.some((a: any) => a.user?.id === user.id) || false,
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

export async function POST(
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

    const body = await request.json();
    const { name, description, listId, priority } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'Task name is required' },
        { status: 400 }
      );
    }

    if (!listId) {
      return NextResponse.json(
        { error: 'List ID is required' },
        { status: 400 }
      );
    }

    // Verify that the list belongs to a board in this workspace
    const { data: listCheck } = await supabase
      .from('task_lists')
      .select('id, workspace_boards!inner(ws_id)')
      .eq('id', listId)
      .eq('workspace_boards.ws_id', wsId)
      .single();

    if (!listCheck) {
      return NextResponse.json(
        { error: 'List not found or access denied' },
        { status: 404 }
      );
    }

    // Create the task
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        list_id: listId,
        priority: priority || null,
        created_at: new Date().toISOString(),
        deleted: false,
        completed: false,
      })
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
        task_lists (
          id,
          name,
          board_id,
          workspace_boards (
            id,
            name,
            ws_id
          )
        )
      `
      )
      .single();

    if (error) throw error;

    // Transform the data to match the expected format
    const task = {
      id: data.id,
      name: data.name,
      description: data.description,
      priority: data.priority,
      completed: data.completed,
      start_date: data.start_date,
      end_date: data.end_date,
      created_at: data.created_at,
      list_id: data.list_id,
      board_name: data.task_lists?.workspace_boards?.name,
      list_name: data.task_lists?.name,
    };

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
