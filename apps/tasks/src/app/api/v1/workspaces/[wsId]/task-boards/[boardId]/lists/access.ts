import {
  canEditTaskBoardAccess,
  resolveTaskBoardAccess,
  type TaskBoardAccess,
  type TaskBoardGuestPermission,
} from '@tuturuuu/apis/tu-do/board-access';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SessionAuthContext } from '@/lib/api-auth';

const paramsSchema = z.object({
  wsId: z.string().min(1),
  boardId: z.guid(),
  listId: z.guid().optional(),
});

type BoardAccessResult =
  | {
      board: { id: string; ws_id: string };
      boardId: string;
      access: TaskBoardAccess;
      list?: { board_id: string; id: string };
      listId?: string;
      sbAdmin: TypedSupabaseClient;
      supabase: SessionAuthContext['supabase'];
      user: SessionAuthContext['user'];
      wsId: string;
    }
  | {
      error: NextResponse;
    };

export async function requireBoardAccess(
  _request: Request,
  rawParams: unknown,
  auth: SessionAuthContext,
  options: { requiredPermission?: TaskBoardGuestPermission } = {}
): Promise<BoardAccessResult> {
  const { wsId: rawWsId, boardId, listId } = paramsSchema.parse(rawParams);
  const { supabase, user } = auth;
  const sbAdmin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const normalizedWsId = await normalizeWorkspaceId(rawWsId, supabase);

  const access = await resolveTaskBoardAccess({
    boardId,
    listId,
    requiredPermission: options.requiredPermission ?? 'view',
    sbAdmin,
    supabase,
    user,
    wsId: normalizedWsId,
  });
  if ('error' in access) return access;

  if (normalizedWsId !== access.wsId) {
    console.warn('Board workspace did not match route workspace', {
      boardId,
      boardWsId: access.wsId,
      routeWsId: normalizedWsId,
    });
  }

  if (
    options.requiredPermission === 'edit' &&
    !canEditTaskBoardAccess(access.access)
  ) {
    return {
      error: NextResponse.json(
        { error: "You don't have permission to perform this operation" },
        { status: 403 }
      ),
    };
  }

  return {
    supabase,
    sbAdmin,
    wsId: access.wsId,
    boardId: access.boardId,
    listId: access.listId,
    user,
    board: access.board,
    list: access.list,
    access: access.access,
  };
}
