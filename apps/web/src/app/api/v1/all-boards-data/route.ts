import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wsIds = searchParams.get('wsIds')?.split(',');
  const q = searchParams.get('q') || '';
  const page = searchParams.get('page') || '1';
  const pageSize = searchParams.get('pageSize') || '10';

  if (!wsIds) {
    return NextResponse.json(
      { error: 'Workspace IDs are required' },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();

    // Build the main query for boards
    const queryBuilder = supabase
      .from('workspace_boards')
      .select('*', { count: 'exact' })
      .in('ws_id', wsIds)
      .order('name', { ascending: true })
      .order('created_at', { ascending: false });

    if (q) queryBuilder.ilike('name', `%${q}%`);

    if (page && pageSize) {
      const parsedPage = parseInt(page, 10);
      const parsedSize = parseInt(pageSize, 10);
      const start = (parsedPage - 1) * parsedSize;
      const end = parsedPage * parsedSize;
      queryBuilder.range(start, end).limit(parsedSize);
    }

    const { data: boards, error: boardsError, count } = await queryBuilder;
    if (boardsError) throw boardsError;

    if (!boards || boards.length === 0) {
      return NextResponse.json({ data: [], count: 0 });
    }

    // Fetch task lists with proper deleted filter
    const { data: taskLists, error: listsError } = await supabase
      .from('task_lists')
      .select('id, name, status, color, position, archived, board_id')
      .in(
        'board_id',
        boards.map((b) => b.id)
      )
      .eq('deleted', false);

    if (listsError) throw listsError;

    // Fetch tasks with proper deleted filter
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select(
        'id, name, description, closed_at, priority, start_date, end_date, created_at, list_id'
      )
      .in(
        'list_id',
        (taskLists || []).map((l) => l.id)
      )
      .is('deleted_at', null);

    if (tasksError) throw tasksError;

    // Group data by board
    const boardsWithData = boards.map((board) => ({
      ...board,
      task_lists: (taskLists || [])
        .filter((list) => list.board_id === board.id)
        .map((list) => ({
          ...list,
          tasks: (tasks || []).filter((task) => task.list_id === list.id),
        })),
    }));

    const data = { data: boardsWithData, count } as {
      data: WorkspaceTaskBoard[];
      count: number;
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch all boards data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch boards data' },
      { status: 500 }
    );
  }
}
