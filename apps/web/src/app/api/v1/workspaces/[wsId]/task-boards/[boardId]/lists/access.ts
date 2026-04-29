import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const paramsSchema = z.object({
  wsId: z.string().min(1),
  boardId: z.guid(),
  listId: z.guid().optional(),
});

export async function requireBoardAccess(request: Request, rawParams: unknown) {
  const { wsId: rawWsId, boardId, listId } = paramsSchema.parse(rawParams);
  const supabase = await createClient(request);

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const sbAdmin = await createAdminClient();
  const normalizedWsId = await normalizeWorkspaceId(rawWsId, supabase);

  const { data: board, error: boardError } = await sbAdmin
    .from('workspace_boards')
    .select('id, ws_id')
    .eq('id', boardId)
    .maybeSingle();

  if (boardError) {
    return {
      error: NextResponse.json(
        { error: 'Failed to load task board' },
        { status: 500 }
      ),
    };
  }

  if (!board) {
    return {
      error: NextResponse.json({ error: 'Board not found' }, { status: 404 }),
    };
  }

  if (normalizedWsId !== board.ws_id) {
    console.warn('Board workspace did not match route workspace', {
      boardId,
      boardWsId: board.ws_id,
      routeWsId: normalizedWsId,
    });
  }

  const memberCheck = await verifyWorkspaceMembershipType({
    wsId: board.ws_id,
    userId: user.id,
    supabase: supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      ),
    };
  }

  if (!memberCheck.ok) {
    return {
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    };
  }

  if (!listId) {
    return { supabase, sbAdmin, wsId: board.ws_id, boardId, user, board };
  }

  const { data: list, error: listError } = await sbAdmin
    .from('task_lists')
    .select('id, board_id')
    .eq('id', listId)
    .eq('board_id', boardId)
    .maybeSingle();

  if (listError) {
    return {
      error: NextResponse.json(
        { error: 'Failed to load task list' },
        { status: 500 }
      ),
    };
  }

  if (!list) {
    return {
      error: NextResponse.json(
        { error: 'Task list not found' },
        { status: 404 }
      ),
    };
  }

  return {
    supabase,
    sbAdmin,
    wsId: board.ws_id,
    boardId,
    listId,
    user,
    board,
    list,
  };
}
