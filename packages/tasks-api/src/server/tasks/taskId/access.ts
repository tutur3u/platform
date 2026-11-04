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
import { type NextRequest, NextResponse } from 'next/server';
import {
  resolveTaskBoardAccess,
  type TaskBoardAccess,
  type TaskBoardGuestPermission,
} from '../../board-access';
import { paramsSchema } from './schema';
export type TaskDetailRouteAuthContext = {
  appSession?: boolean;
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
};

type TaskRequestAuth =
  | {
      auth: TaskDetailRouteAuthContext;
    }
  | {
      error: NextResponse;
    };

type TaskWorkspaceAccess =
  | {
      supabase: TypedSupabaseClient;
      taskId: string;
      access: TaskBoardAccess;
      user: SupabaseUser;
      wsId: string;
    }
  | {
      error: NextResponse;
    };

export type TaskDetailRouteContext = {
  params: Promise<{ wsId: string; taskId: string }>;
};

async function resolveTaskRequestAuth(
  request: NextRequest,
  auth?: TaskDetailRouteAuthContext
): Promise<TaskRequestAuth> {
  if (auth) {
    return {
      auth: {
        ...auth,
        appSession: auth.appSession === true,
      },
    };
  }

  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { auth: { appSession: false, supabase, user } };
}

export async function requireWorkspaceAccess(
  request: NextRequest,
  rawParams: unknown,
  authContext?: TaskDetailRouteAuthContext,
  options: {
    memberOnly?: boolean;
    requiredPermission?: TaskBoardGuestPermission;
  } = {}
): Promise<TaskWorkspaceAccess> {
  const { wsId: rawWsId, taskId } = paramsSchema.parse(rawParams);
  const resolvedAuth = await resolveTaskRequestAuth(request, authContext);
  if ('error' in resolvedAuth) return resolvedAuth;

  const auth = resolvedAuth.auth;
  const { supabase, user } = auth;
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  const memberCheck = await verifyWorkspaceMembershipType({
    wsId: wsId,
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

  if (memberCheck.ok && options.requiredPermission !== 'edit') {
    return {
      access: { mode: 'member', permission: 'edit' },
      supabase,
      user,
      wsId,
      taskId,
    };
  }

  if (options.memberOnly && !memberCheck.ok) {
    return {
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    };
  }

  const sbAdmin = await createAdminClient();
  let listId: string | null = null;
  if (options.memberOnly) {
    const { data: task, error } = await sbAdmin
      .from('tasks')
      .select('list_id')
      .eq('id', taskId)
      .maybeSingle();
    if (error)
      return {
        error: NextResponse.json(
          { error: 'Failed to load task' },
          { status: 500 }
        ),
      };
    if (!task?.list_id)
      return {
        error: NextResponse.json({ error: 'Task not found' }, { status: 404 }),
      };
    listId = task.list_id;
  }
  const boardAccess = await resolveTaskBoardAccess({
    requiredPermission: options.requiredPermission ?? 'view',
    sbAdmin,
    supabase,
    ...(options.memberOnly ? { listId } : { taskId }),
    user,
    wsId,
  });

  if ('error' in boardAccess) return boardAccess;

  if (boardAccess.wsId !== wsId) {
    return {
      error: NextResponse.json({ error: 'Task not found' }, { status: 404 }),
    };
  }

  return {
    access: boardAccess.access,
    supabase,
    user,
    wsId,
    taskId,
  };
}
