import {
  canEditTaskBoardAccess,
  resolveTaskBoardAccess,
  type TaskBoardAccess,
  type TaskBoardGuestPermission,
} from '@tuturuuu/apis/tu-do/board-access';
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
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';

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
      access: TaskBoardAccess;
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
    targetApp: ['calendar', 'tasks'],
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
  rawParams: unknown,
  options: { requiredPermission?: TaskBoardGuestPermission } = {}
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
    serverLogger.warn('Board workspace did not match route workspace', {
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
