import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import { NextResponse } from 'next/server';

type SessionTaskValidationResult =
  | { ok: true; errorResponse?: never }
  | { ok: false; errorResponse: NextResponse };

export async function validateSessionTaskWorkspace({
  sbAdmin,
  taskId,
  wsId,
}: {
  sbAdmin: TypedSupabaseClient;
  taskId: string | null | undefined;
  wsId: string;
}): Promise<SessionTaskValidationResult> {
  if (!taskId) return { ok: true };

  const { data: task, error } = await sbAdmin
    .from('tasks')
    .select('id, task_lists!inner(workspace_boards!inner(ws_id))')
    .eq('id', taskId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      errorResponse: NextResponse.json(
        { error: 'Failed to validate task' },
        { status: 500 }
      ),
    };
  }

  if (!task || task.task_lists?.workspace_boards?.ws_id !== wsId) {
    return {
      ok: false,
      errorResponse: NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      ),
    };
  }

  return { ok: true };
}
