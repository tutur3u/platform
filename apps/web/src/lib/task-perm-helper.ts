import type { SupabaseClient, SupabaseUser } from '@tuturuuu/supabase';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

export type TaskShareAccessResult =
  | {
      success: true;
      data: {
        supabase: SupabaseClient;
        user: SupabaseUser | null;
        normalizedWsId: string;
        taskId: string;
      };
    }
  | { success: false; response: NextResponse };

export async function verifyTaskShareAccess(
  wsId: string,
  taskId: string
): Promise<TaskShareAccessResult> {
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  if (!normalizedWsId || !validate(normalizedWsId) || !validate(taskId)) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      ),
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  // Verify workspace access
  const { data: memberCheck } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', normalizedWsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!memberCheck) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      ),
    };
  }

  // Verify task belongs to workspace
  const { data: task } = await supabase
    .from('tasks')
    .select(
      `
      id,
      task_lists!inner (
        id,
        workspace_boards!inner (
          ws_id
        )
      )
    `
    )
    .eq('id', taskId)
    .maybeSingle();

  if (!task || task.task_lists?.workspace_boards?.ws_id !== normalizedWsId) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Task not found in this workspace' },
        { status: 404 }
      ),
    };
  }

  return {
    success: true,
    data: { supabase, user, normalizedWsId, taskId },
  };
}
