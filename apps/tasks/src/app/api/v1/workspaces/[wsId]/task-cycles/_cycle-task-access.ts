import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export const OPEN_TASK_LIST_STATUSES = [
  'not_started',
  'active',
  'review',
] as const;

export const CYCLE_PLANNABLE_LIST_STATUSES = [
  ...OPEN_TASK_LIST_STATUSES,
  'done',
  'closed',
] as const;

export const MAX_CYCLE_TASKS = 500;

type AccessResult =
  | { ok: true; wsId: string }
  | { ok: false; response: NextResponse };

function failure(error: string, status: number): AccessResult {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

/**
 * Membership is enough to read; writes also need `manage_projects`, the same
 * permission that gates the Cycles pages.
 */
export async function resolveCycleWorkspaceAccess(
  supabase: TypedSupabaseClient,
  user: SupabaseUser,
  rawWsId: string,
  { write = false }: { write?: boolean } = {}
): Promise<AccessResult> {
  let wsId: string;
  try {
    wsId = await normalizeWorkspaceId(rawWsId, supabase);
  } catch {
    return failure('Workspace not found', 404);
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId,
    userId: user.id,
    supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return failure('Failed to verify workspace access', 500);
  }

  if (!membership.ok) {
    return failure('Forbidden', 403);
  }

  if (write) {
    const permissions = await getPermissions({ user, wsId });
    if (!permissions) {
      return failure('Failed to resolve workspace permissions', 500);
    }
    if (!permissions.containsPermission('manage_projects')) {
      return failure(
        "You don't have permission to perform this operation",
        403
      );
    }
  }

  return { ok: true, wsId };
}

/** Returns an error response unless `cycleId` belongs to `wsId`. */
export async function assertCycleInWorkspace(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  cycleId: string
): Promise<NextResponse | null> {
  const { data: cycle, error } = await sbAdmin
    .from('task_cycles')
    .select('ws_id')
    .eq('id', cycleId)
    .maybeSingle();

  if (error) {
    console.error('Error loading task cycle:', error);
    return NextResponse.json(
      { error: 'Failed to load cycle' },
      { status: 500 }
    );
  }

  if (!cycle || cycle.ws_id !== wsId) {
    return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
  }

  return null;
}

/**
 * Validates server-side that the task belongs to `wsId` before any
 * service-role write. The database trigger enforces the same rule; this keeps
 * the API response a clean 404 instead of a constraint error.
 */
export async function assertTaskInWorkspace(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  taskId: string
): Promise<NextResponse | null> {
  const { data: task, error } = await sbAdmin
    .from('tasks')
    .select('id, deleted_at, task_lists(status, workspace_boards(ws_id))')
    .eq('id', taskId)
    .maybeSingle();

  if (error) {
    console.error('Error loading task:', error);
    return NextResponse.json({ error: 'Failed to load task' }, { status: 500 });
  }

  if (
    !task ||
    task.deleted_at ||
    task.task_lists?.workspace_boards?.ws_id !== wsId
  ) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (task.task_lists?.status === 'documents') {
    return NextResponse.json(
      { error: 'Document-list tasks cannot be added to a cycle' },
      { status: 400 }
    );
  }

  return null;
}
