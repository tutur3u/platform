import type { SupabaseClient, SupabaseUser } from '@tuturuuu/supabase';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

export type TaskShareAccessResult =
  | {
      success: true;
      data: {
        supabase: SupabaseClient;
        user: SupabaseUser;
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

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  // Verify workspace access
  const memberCheck = await verifyWorkspaceMembershipType({
    wsId: normalizedWsId,
    userId: user.id,
    supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      ),
    };
  }

  if (!memberCheck.ok) {
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
