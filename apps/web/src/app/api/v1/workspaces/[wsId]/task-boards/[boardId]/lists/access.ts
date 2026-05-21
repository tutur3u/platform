import {
  attachSupabaseAuthUser,
  createAppSessionUser,
  getAppSessionTokenFromRequest,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import { verifyCliAccessToken } from '@tuturuuu/auth/cli-session';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
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

type BoardRequestAuth =
  | {
      appSession: false;
      supabase: TypedSupabaseClient;
      user: SupabaseUser;
    }
  | {
      appSession: true;
      sbAdmin: TypedSupabaseClient;
      supabase: TypedSupabaseClient;
      user: SupabaseUser;
    }
  | {
      error: NextResponse;
    };

type BoardAccessResult =
  | {
      board: { id: string; ws_id: string };
      boardId: string;
      list?: { board_id: string; id: string };
      listId?: string;
      sbAdmin: TypedSupabaseClient;
      supabase: TypedSupabaseClient;
      user: SupabaseUser;
      wsId: string;
    }
  | {
      error: NextResponse;
    };

async function resolveBoardRequestAuth(
  request: Request
): Promise<BoardRequestAuth> {
  const taskAppSessionVerification = verifyAppSessionRequest(request, {
    targetApp: 'tasks',
  });

  if (taskAppSessionVerification.ok) {
    const sbAdmin = (await createAdminClient({
      noCookie: true,
    })) as TypedSupabaseClient;
    const user = createAppSessionUser(taskAppSessionVerification.claims);
    const supabase = attachSupabaseAuthUser(sbAdmin, user);

    return {
      appSession: true,
      sbAdmin,
      supabase,
      user,
    };
  }

  const appSessionToken = getAppSessionTokenFromRequest(request);

  if (appSessionToken) {
    const verification = verifyCliAccessToken(appSessionToken);

    if (verification.ok) {
      const sbAdmin = (await createAdminClient({
        noCookie: true,
      })) as TypedSupabaseClient;
      const user = createAppSessionUser(verification.claims);
      const supabase = attachSupabaseAuthUser(sbAdmin, user);

      return {
        appSession: true,
        sbAdmin,
        supabase,
        user,
      };
    }
  }

  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { appSession: false, supabase, user };
}

export async function requireBoardAccess(
  request: Request,
  rawParams: unknown
): Promise<BoardAccessResult> {
  const { wsId: rawWsId, boardId, listId } = paramsSchema.parse(rawParams);
  const auth = await resolveBoardRequestAuth(request);
  if ('error' in auth) return auth;

  const { supabase, user } = auth;
  const sbAdmin: TypedSupabaseClient =
    'sbAdmin' in auth
      ? auth.sbAdmin
      : ((await createAdminClient()) as TypedSupabaseClient);
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
