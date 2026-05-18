import {
  DELETE as deleteBoard,
  PUT as updateBoard,
} from '@tuturuuu/apis/tu-do/board/boardId/route';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBoardAccess } from './lists/access';

const paramsSchema = z.object({
  wsId: z.string().min(1),
  boardId: z.guid(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string; boardId: string }> }
) {
  try {
    const parsedParams = paramsSchema.parse(await params);
    const access = await requireBoardAccess(request, parsedParams);
    if ('error' in access) return access.error;

    const { boardId, sbAdmin } = access;

    const { data: board, error } = await sbAdmin
      .from('workspace_boards')
      .select(
        'id, ws_id, name, icon, ticket_prefix, created_at, archived_at, deleted_at, estimation_type, extended_estimation, allow_zero_estimates, count_unestimated_issues, task_lists(id, board_id, name, status, color, position, archived, deleted, created_at, creator_id)'
      )
      .eq('id', boardId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to load task board' },
        { status: 500 }
      );
    }

    if (!board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    const normalizedBoard = {
      ...board,
      task_lists: (board.task_lists ?? []).sort((a, b) => {
        const positionDelta = (a.position ?? 0) - (b.position ?? 0);
        if (positionDelta !== 0) return positionDelta;
        return (
          new Date(a.created_at ?? 0).getTime() -
          new Date(b.created_at ?? 0).getTime()
        );
      }),
    };

    return NextResponse.json({ board: normalizedBoard });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid workspace or board ID' },
        { status: 400 }
      );
    }

    console.error('Error fetching task board:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const PUT = updateBoard;
export const DELETE = deleteBoard;
