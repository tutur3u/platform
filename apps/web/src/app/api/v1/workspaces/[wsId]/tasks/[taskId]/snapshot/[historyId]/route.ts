import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceTask } from '@tuturuuu/types/db';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';

type TaskRelationshipsSnapshot = {
  assignees?: { id: string; user_id: string }[];
  labels?: { id: string }[];
  projects?: { id: string }[];
};

/**
 * GET /api/v1/workspaces/[wsId]/tasks/[taskId]/snapshot/[historyId]
 * Returns the reconstructed task state at a specific history point
 */
export async function GET(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ wsId: string; taskId: string; historyId: string }>;
  }
) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { wsId: rawWsId, taskId, historyId } = await params;
    const wsId = resolveWorkspaceId(rawWsId);

    // Validate UUIDs
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(taskId) || !uuidRegex.test(historyId)) {
      return NextResponse.json(
        { error: 'Invalid task or history ID' },
        { status: 400 }
      );
    }

    // Get task snapshot at history point
    const { data: taskSnapshot, error: snapshotError } = (await supabase.rpc(
      'get_task_snapshot_at_history',
      {
        p_ws_id: wsId,
        p_task_id: taskId,
        p_history_id: historyId,
      }
    )) as { data: WorkspaceTask | null; error: Error | null };

    if (snapshotError) {
      console.error('Error fetching task snapshot:', snapshotError);

      // Handle specific error messages
      if (snapshotError.message === 'Access denied to workspace') {
        return NextResponse.json(
          { error: 'Access denied to workspace' },
          { status: 403 }
        );
      }
      if (snapshotError.message === 'Task not found') {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      if (snapshotError.message === 'Task does not belong to this workspace') {
        return NextResponse.json(
          { error: 'Task does not belong to this workspace' },
          { status: 403 }
        );
      }
      if (snapshotError.message === 'History entry not found') {
        return NextResponse.json(
          { error: 'History entry not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to fetch task snapshot' },
        { status: 500 }
      );
    }

    // Get relationships at snapshot point
    const { data: relationshipsSnapshot, error: relationshipsError } =
      (await supabase.rpc('get_task_relationships_at_snapshot', {
        p_ws_id: wsId,
        p_task_id: taskId,
        p_history_id: historyId,
      })) as { data: TaskRelationshipsSnapshot | null; error: Error | null };

    if (relationshipsError) {
      console.error(
        'Error fetching relationships snapshot:',
        relationshipsError
      );
      // Continue with empty relationships rather than failing
    }

    // Get the history entry details for context
    const { data: historyEntry } = await supabase
      .from('task_history')
      .select('id, changed_at, change_type, field_name, changed_by')
      .eq('id', historyId)
      .single();

    // Merge task snapshot with relationships
    const fullSnapshot = {
      ...(taskSnapshot || {}),
      assignees: relationshipsSnapshot?.assignees || [],
      labels: relationshipsSnapshot?.labels || [],
      projects: relationshipsSnapshot?.projects || [],
    };

    return NextResponse.json({
      snapshot: fullSnapshot,
      historyEntry: historyEntry
        ? {
            id: historyEntry.id,
            changed_at: historyEntry.changed_at,
            change_type: historyEntry.change_type,
            field_name: historyEntry.field_name,
          }
        : null,
    });
  } catch (error) {
    console.error('Error in task snapshot API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
