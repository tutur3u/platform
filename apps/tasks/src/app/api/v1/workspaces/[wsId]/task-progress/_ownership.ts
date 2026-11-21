import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { NextResponse } from 'next/server';
import {
  type TaskProgressRouteAuth,
  taskProgressErrorResponse,
} from './_utils';

type OwnedTable =
  | 'task_leaderboards'
  | 'task_progress_entries'
  | 'task_progress_goals'
  | 'task_progress_metrics';

const OWNER_COLUMN: Record<OwnedTable, 'created_by' | 'owner_id'> = {
  task_leaderboards: 'created_by',
  task_progress_entries: 'created_by',
  task_progress_goals: 'owner_id',
  task_progress_metrics: 'created_by',
};

export type TaskProgressRowAccess =
  | { ok: true; ownerFilter: Record<string, string> }
  | { ok: false; response: NextResponse };

// Members with the Tasks management permission may change or archive any
// task progress row in their workspace; everyone else only their own rows.
export async function canManageTaskProgress(auth: TaskProgressRouteAuth) {
  const permissions = await getPermissions({
    user: auth.user,
    wsId: auth.wsId,
  });
  return permissions?.containsPermission('manage_projects') ?? false;
}

// Resolves whether the actor may change one row. Callers pass `ownerFilter`
// to their write with `.match()`, so an owner-only decision still holds if
// the row changes hands between this check and the write.
export async function requireTaskProgressRowAccess(
  auth: TaskProgressRouteAuth,
  table: OwnedTable,
  id: string,
  notFoundMessage: string
): Promise<TaskProgressRowAccess> {
  const ownerColumn = OWNER_COLUMN[table];
  const { data, error } = await (auth.sbAdmin as any)
    .from(table)
    .select(`id, ${ownerColumn}`)
    .eq('id', id)
    .eq('ws_id', auth.wsId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      ok: false,
      response: taskProgressErrorResponse(notFoundMessage, 404),
    };
  }

  if (data[ownerColumn] === auth.user.id) {
    return { ok: true, ownerFilter: { [ownerColumn]: auth.user.id } };
  }

  if (await canManageTaskProgress(auth)) {
    return { ok: true, ownerFilter: {} };
  }

  return {
    ok: false,
    response: taskProgressErrorResponse(
      'Only the owner or a Tasks manager can change this item',
      403
    ),
  };
}
