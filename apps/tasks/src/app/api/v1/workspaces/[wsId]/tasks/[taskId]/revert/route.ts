import { getAppSessionTokenFromRequest } from '@tuturuuu/auth/app-session';
import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';

const TASK_REVERT_ROUTE_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'calendar', 'tasks'],
} as const;

const REVERTIBLE_FIELDS = [
  'name',
  'description',
  'priority',
  'start_date',
  'end_date',
  'estimation_points',
  'list_id',
  'completed',
  'assignees',
  'labels',
  'projects',
] as const;

const revertSchema = z.object({
  historyId: z.guid('Invalid history ID'),
  fields: z
    .array(z.enum(REVERTIBLE_FIELDS))
    .min(1, 'At least one field must be selected')
    .transform((fields) => [...new Set(fields)]),
});

type RevertRpcResponse = {
  revertedFields: (typeof REVERTIBLE_FIELDS)[number][];
  task: Task;
};

type RevertRpc = (
  functionName: string,
  args: Record<string, unknown>
) => PromiseLike<{ data: RevertRpcResponse | null; error: Error | null }>;

function getRevertErrorResponse(error: Error) {
  if (
    error.message === 'Access denied to workspace' ||
    error.message === 'Task does not belong to this workspace'
  ) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (
    error.message === 'Task not found' ||
    error.message === 'History entry not found'
  ) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (
    error.message.includes('foreign key constraint') ||
    error.message.includes('invalid input syntax')
  ) {
    return NextResponse.json(
      { error: 'The selected version references data that no longer exists' },
      { status: 409 }
    );
  }

  console.error('Error reverting task history:', error);
  return NextResponse.json(
    { error: 'Failed to restore task version' },
    { status: 500 }
  );
}

/**
 * POST /api/v1/workspaces/[wsId]/tasks/[taskId]/revert
 * Atomically restores selected fields to the version immediately before a
 * specific task history entry.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const auth = await resolveSessionAuthContext(req, {
      allowAppSessionAuth: TASK_REVERT_ROUTE_APP_SESSION_AUTH,
    });
    if (!auth.ok) return auth.response;

    const { supabase, user } = auth;
    const { wsId: rawWsId, taskId } = await params;
    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    if (!z.guid().safeParse(taskId).success) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    const validation = revertSchema.safeParse(await req.json());
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const isAppSession = Boolean(getAppSessionTokenFromRequest(req));
    const args = {
      p_ws_id: wsId,
      p_task_id: taskId,
      p_history_id: validation.data.historyId,
      p_fields: validation.data.fields,
    };
    const revertRpc = supabase.rpc.bind(supabase) as unknown as RevertRpc;
    const { data, error } = await revertRpc(
      isAppSession
        ? 'revert_task_to_history_for_actor'
        : 'revert_task_to_history',
      isAppSession ? { ...args, p_actor_user_id: user.id } : args
    );

    if (error) return getRevertErrorResponse(error);
    if (!data?.task) {
      console.error('Task history revert returned no task');
      return NextResponse.json(
        { error: 'Failed to restore task version' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      revertedFields: data.revertedFields,
      task: data.task,
    });
  } catch (error) {
    console.error('Error in task revert API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
