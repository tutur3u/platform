import {
  DELETE as deleteBoard,
  PUT as updateBoard,
} from '@tuturuuu/apis/tu-do/board/boardId/route';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const paramsSchema = z.object({
  wsId: z.string().min(1),
  boardId: z.guid(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string; boardId: string }> }
) {
  try {
    const { wsId: rawWsId, boardId } = paramsSchema.parse(await params);
    const supabase = await createClient(request);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    const { data: memberCheck, error: memberError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError) {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    const { data: board, error } = await sbAdmin
      .from('workspace_boards')
      .select(
        'id, ws_id, name, icon, ticket_prefix, created_at, archived_at, deleted_at, estimation_type, extended_estimation, allow_zero_estimates, count_unestimated_issues'
      )
      .eq('ws_id', wsId)
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

    return NextResponse.json({ board });
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
