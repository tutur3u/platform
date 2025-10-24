import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';

interface WorkspaceParams {
  wsId: string;
}

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<WorkspaceParams> }
) {
  try {
    const { wsId } = await params;

    if (!validate(wsId)) {
      return NextResponse.json(
        { error: 'Invalid workspace ID' },
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
        { error: 'Please sign in to view deleted items' },
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

    // Calculate the cutoff date (30 days ago)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString();

    // Fetch deleted boards (only those deleted within last 30 days)
    const { data: deletedBoards, error: boardsError } = await supabase
      .from('workspace_boards')
      .select('id, name, deleted_at, created_at')
      .eq('ws_id', wsId)
      .not('deleted_at', 'is', null)
      .gte('deleted_at', cutoffDate)
      .order('deleted_at', { ascending: false });

    if (boardsError) {
      console.error('Error fetching deleted boards:', boardsError);
      return NextResponse.json(
        { error: 'Failed to fetch deleted boards' },
        { status: 500 }
      );
    }

    // Fetch deleted tasks with their board context (only those deleted within last 30 days)
    const { data: deletedTasks, error: tasksError } = await supabase
      .from('tasks')
      .select(
        `
        id,
        name,
        description,
        deleted_at,
        created_at,
        list_id,
        task_lists!inner (
          id,
          name,
          workspace_boards!inner (
            id,
            name,
            ws_id
          )
        )
      `
      )
      .eq('task_lists.workspace_boards.ws_id', wsId)
      .not('deleted_at', 'is', null)
      .gte('deleted_at', cutoffDate)
      .order('deleted_at', { ascending: false });

    if (tasksError) {
      console.error('Error fetching deleted tasks:', tasksError);
      return NextResponse.json(
        { error: 'Failed to fetch deleted tasks' },
        { status: 500 }
      );
    }

    // Transform tasks to include board context
    const transformedTasks = deletedTasks?.map((task) => ({
      id: task.id,
      name: task.name,
      description: task.description,
      deleted_at: task.deleted_at,
      created_at: task.created_at,
      list_id: task.list_id,
      list_name: task.task_lists?.name,
      board_id: task.task_lists?.workspace_boards?.id,
      board_name: task.task_lists?.workspace_boards?.name,
    }));

    // Calculate days until auto-deletion (30 days from deleted_at)
    const calculateDaysRemaining = (deletedAt: string) => {
      const deleted = new Date(deletedAt);
      const now = new Date();
      const autoDeleteDate = new Date(deleted);
      autoDeleteDate.setDate(autoDeleteDate.getDate() + 30);
      const daysRemaining = Math.ceil(
        (autoDeleteDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return Math.max(0, daysRemaining);
    };

    // Add days remaining to items
    const boardsWithDays = deletedBoards?.map((board) => ({
      ...board,
      days_until_permanent_deletion: calculateDaysRemaining(
        board.deleted_at || ''
      ),
    }));

    const tasksWithDays = transformedTasks?.map((task) => ({
      ...task,
      days_until_permanent_deletion: calculateDaysRemaining(
        task.deleted_at || ''
      ),
    }));

    return NextResponse.json({
      boards: boardsWithDays || [],
      tasks: tasksWithDays || [],
      total: (boardsWithDays?.length || 0) + (tasksWithDays?.length || 0),
    });
  } catch (error) {
    console.error('Error fetching deleted items:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
