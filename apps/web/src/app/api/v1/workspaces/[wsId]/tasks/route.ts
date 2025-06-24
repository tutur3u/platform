import { createClient } from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

// Type interfaces for better type safety
interface ProcessedAssignee {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface TaskAssigneeData {
  user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    email?: string;
  } | null;
}

interface TaskListData {
  id: string;
  name: string | null;
  // Task list status: 'not_started' | 'active' | 'done' | 'closed'
  // Used to determine task availability for time tracking
  status: string | null;
  workspace_boards: {
    id: string;
    name: string | null;
    ws_id: string;
  } | null;
}

interface TaskData {
  id: string;
  name: string;
  description: string | null;
  priority: number | null;
  completed: boolean | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  list_id: string | null;
  archived: boolean | null;
  task_lists: TaskListData | null;
  assignees?: TaskAssigneeData[];
}

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

    const parsedLimit = Number.parseInt(
      url.searchParams.get('limit') ?? '',
      10
    );
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 200)
        : 100;

    const parsedOffset = Number.parseInt(
      url.searchParams.get('offset') ?? '',
      10
    );
    const offset =
      Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
    const boardId = url.searchParams.get('boardId');
    const listId = url.searchParams.get('listId');

    // Check if this is a request for time tracking (indicated by limit=100 and no specific filters)
    const isTimeTrackingRequest = limit === 100 && !boardId && !listId;

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
        archived,
        task_lists!inner (
          id,
          name,
          status,
          board_id,
          workspace_boards!inner (
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

    // IMPORTANT: If this is for time tracking, apply the same filters as the server-side helper
    if (isTimeTrackingRequest) {
      query = query
        .eq('archived', false) // Only non-archived tasks
        .in('task_lists.status', ['not_started', 'active']) // Only from active lists
        .eq('task_lists.deleted', false); // Ensure list is not deleted
    }

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
      throw new Error('TASKS_QUERY_FAILED');
    }

    // Transform the data to match the expected WorkspaceTask format
    const tasks =
      data?.map((task: TaskData) => ({
        id: task.id,
        name: task.name,
        description: task.description,
        priority: task.priority,
        completed: task.completed,
        start_date: task.start_date,
        end_date: task.end_date,
        created_at: task.created_at,
        list_id: task.list_id,
        archived: task.archived,
        // Add board information for context
        board_name: task.task_lists?.workspace_boards?.name,
        list_name: task.task_lists?.name,
        list_status: task.task_lists?.status,
        // Add assignee information
        assignees: [
          ...(task.assignees ?? [])
            .map((a: TaskAssigneeData) => a.user)
            .filter((u): u is ProcessedAssignee => !!u?.id)
            .reduce(
              (
                uniqueUsers: Map<string, ProcessedAssignee>,
                user: ProcessedAssignee
              ) => {
                if (!uniqueUsers.has(user.id)) {
                  uniqueUsers.set(user.id, user);
                }
                return uniqueUsers;
              },
              new Map()
            )
            .values(),
        ],
        // Add helper field to identify if current user is assigned
        is_assigned_to_current_user:
          task.assignees?.some(
            (a: TaskAssigneeData) => a.user?.id === user.id
          ) || false,
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
