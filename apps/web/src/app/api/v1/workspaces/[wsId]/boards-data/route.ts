import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_SEARCH_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const paramsSchema = z.object({
  wsId: z.uuid(),
});

const searchParamsSchema = z.object({
  q: z.string().max(MAX_SEARCH_LENGTH).optional(),
  page: z.string().max(MAX_LONG_TEXT_LENGTH).optional().default('1'),
  pageSize: z.string().max(MAX_LONG_TEXT_LENGTH).optional().default('10'),
});

export const GET = withSessionAuth<{ wsId: string }>(
  async (req, { user, supabase }, rawParams) => {
    try {
      const { wsId } = paramsSchema.parse(rawParams);
      const { q, page, pageSize } = searchParamsSchema.parse(
        Object.fromEntries(req.nextUrl.searchParams)
      );

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

      const sbAdmin = await createAdminClient();

      // Build the main query for boards
      const queryBuilder = sbAdmin
        .from('workspace_boards')
        .select('*', { count: 'exact' })
        .eq('ws_id', wsId)
        .order('name', { ascending: true })
        .order('created_at', { ascending: false });

      if (q) queryBuilder.ilike('name', `%${q}%`);

      const parsedPage = parseInt(page, 10);
      const parsedSize = parseInt(pageSize, 10);
      const start = (parsedPage - 1) * parsedSize;
      const end = start + parsedSize - 1;
      queryBuilder.range(start, end).limit(parsedSize);

      const { data: boards, error: boardsError, count } = await queryBuilder;

      if (boardsError) {
        throw boardsError;
      }

      if (!boards || boards.length === 0) {
        return NextResponse.json({ data: [], count: 0 });
      }

      // Fetch task lists with proper deleted filter
      const { data: taskLists, error: listsError } = await sbAdmin
        .from('task_lists')
        .select('id, name, status, color, position, archived, board_id')
        .in(
          'board_id',
          boards.map((b) => b.id)
        )
        .eq('deleted', false);

      if (listsError) throw listsError;

      // Fetch tasks with proper deleted filter
      const { data: tasks, error: tasksError } = await sbAdmin
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
      })) as WorkspaceTaskBoard[];

      return NextResponse.json({ data: boardsWithData, count });
    } catch (error) {
      console.error('Error fetching boards data:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { cache: { maxAge: 10, swr: 20 } }
);
