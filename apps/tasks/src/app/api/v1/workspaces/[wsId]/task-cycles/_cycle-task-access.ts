import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export const OPEN_TASK_LIST_STATUSES = [
  'not_started',
  'active',
  'review',
] as const;

type AccessResult =
  | { ok: true; wsId: string }
  | { ok: false; response: NextResponse };

function failure(error: string, status: number): AccessResult {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

export async function resolveCycleWorkspaceAccess(
  supabase: TypedSupabaseClient,
  userId: string,
  rawWsId: string
): Promise<AccessResult> {
  let wsId: string;
  try {
    wsId = await normalizeWorkspaceId(rawWsId, supabase);
  } catch {
    return failure('Workspace not found', 404);
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId,
    userId,
    supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return failure('Failed to verify workspace access', 500);
  }

  if (!membership.ok) {
    return failure('Forbidden', 403);
  }

  return { ok: true, wsId };
}

/**
 * Validates server-side that both the cycle and the task belong to `wsId`
 * before any write. The database trigger enforces the same rule; this keeps
 * the API response a clean 404 instead of a constraint error.
 */
export async function assertCycleAndTaskInWorkspace(
  supabase: TypedSupabaseClient,
  { wsId, cycleId, taskId }: { wsId: string; cycleId: string; taskId: string }
): Promise<NextResponse | null> {
  const { data: cycle, error: cycleError } = await supabase
    .from('task_cycles')
    .select('ws_id')
    .eq('id', cycleId)
    .maybeSingle();

  if (cycleError) {
    console.error('Error loading task cycle:', cycleError);
    return NextResponse.json(
      { error: 'Failed to load cycle' },
      { status: 500 }
    );
  }

  if (!cycle || cycle.ws_id !== wsId) {
    return NextResponse.json({ error: 'Cycle not found' }, { status: 404 });
  }

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id, deleted_at, task_lists(status, workspace_boards(ws_id))')
    .eq('id', taskId)
    .maybeSingle();

  if (taskError) {
    console.error('Error loading task:', taskError);
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
