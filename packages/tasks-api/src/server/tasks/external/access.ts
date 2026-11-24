import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import type { TaskBoardAccess } from '../../board-access';
import {
  requireWorkspaceAccess,
  type TaskDetailRouteAuthContext,
} from '../taskId/access';

export type TaskScope = {
  access: TaskBoardAccess;
  admin: TypedSupabaseClient;
  taskId: string;
  user: SupabaseUser;
  wsId: string;
};

export type TaskScopeResult = TaskScope | { error: NextResponse };

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** True when the workspace grants the caller manage_projects (creators included). */
export async function canManageProjects(user: SupabaseUser, wsId: string) {
  const permissions = await getPermissions({ user, wsId });
  return permissions?.containsPermission('manage_projects') === true;
}

/**
 * Resolves the caller and checks they can reach the task. The private tables
 * are service-role only, so every handler goes through this first.
 *
 * `permission: 'view'` is task access; `'edit'` needs task edit rights.
 * `write: true` additionally refuses view-only board guests, who can read a
 * task but not add to it.
 *
 * The task must live in the workspace named in the URL. Member access is
 * granted per workspace, so a task id from another workspace is a 404 here.
 */
export async function requireTaskScope(
  request: NextRequest,
  rawParams: unknown,
  auth: TaskDetailRouteAuthContext | undefined,
  options: { permission?: 'view' | 'edit'; write?: boolean } = {}
): Promise<TaskScopeResult> {
  const access = await requireWorkspaceAccess(request, rawParams, auth, {
    requiredPermission: options.permission ?? 'view',
  });
  if ('error' in access) return access;

  if (
    options.write &&
    access.access.mode === 'guest' &&
    access.access.permission !== 'edit'
  ) {
    return { error: jsonError('Workspace access denied', 403) };
  }

  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const { data, error } = await admin
    .from('tasks')
    .select('id, deleted_at, task_lists!inner(workspace_boards!inner(ws_id))')
    .eq('id', access.taskId)
    .maybeSingle();
  if (error) return { error: jsonError('Failed to load task', 500) };

  const list = data?.task_lists as
    | { workspace_boards: { ws_id: string } | null }
    | null
    | undefined;
  if (
    !data ||
    data.deleted_at ||
    list?.workspace_boards?.ws_id !== access.wsId
  ) {
    return { error: jsonError('Task not found', 404) };
  }

  return {
    access: access.access,
    admin,
    taskId: access.taskId,
    user: access.user,
    wsId: access.wsId,
  };
}
