import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const searchParamsSchema = z.object({
  wsIds: z
    .string()
    .transform((val) => val.split(',').filter((id) => id.trim() !== ''))
    .pipe(z.array(z.string()).min(1, 'At least one workspace ID is required')),
  q: z.string().default(''),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().default(10),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // Validate search params
  const parseResult = searchParamsSchema.safeParse({
    wsIds: searchParams.get('wsIds') ?? '',
    q: searchParams.get('q') ?? '',
    page: searchParams.get('page') ?? '1',
    pageSize: searchParams.get('pageSize') ?? '10',
  });

  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid query', details: parseResult.error.format() },
      { status: 400 }
    );
  }

  const { wsIds, q, page, pageSize } = parseResult.data;

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

    const start = (page - 1) * pageSize;
    const end = page * pageSize;
    queryBuilder.range(start, end).limit(pageSize);

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
    const listIds = (taskLists || []).map((l) => l.id);
    let tasks: any[] | null = null;
    let tasksError = null;

    if (listIds.length === 0) {
      tasks = [];
    } else {
      const result = await supabase
        .from('tasks')
        .select(
          'id, name, description, closed_at, priority, start_date, end_date, created_at, list_id'
        )
        .in('list_id', listIds)
        .is('deleted_at', null);

      tasks = result.data;
      tasksError = result.error;

      if (tasksError) throw tasksError;
    }

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
