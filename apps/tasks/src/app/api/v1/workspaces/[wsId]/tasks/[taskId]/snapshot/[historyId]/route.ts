import { getAppSessionTokenFromRequest } from '@tuturuuu/auth/app-session';
import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceTask } from '@tuturuuu/types/db';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { resolveCoMemberDisplayNames } from '@/lib/co-member-display-names';
import {
  getRelationshipsBeforeSelectedChange,
  getSnapshotBeforeSelectedChange,
} from './snapshot-state';

const TASK_SNAPSHOT_ROUTE_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'calendar', 'tasks'],
} as const;

type TaskRelationshipsSnapshot = {
  assignees?: { id: string; user_id: string }[];
  labels?: { id: string }[];
  projects?: { id: string }[];
};

type SnapshotRpc = <T>(
  functionName: string,
  args: Record<string, unknown>
) => PromiseLike<{ data: T | null; error: Error | null }>;

function assigneeUserId(assignee: Record<string, unknown>) {
  const id = assignee.user_id ?? assignee.id;
  return typeof id === 'string' ? id : null;
}

async function withAssigneeNames<T extends Record<string, unknown>>(
  assignees: T[],
  { wsId, viewerUserId }: { wsId: string; viewerUserId: string }
): Promise<T[]> {
  if (assignees.length === 0) return assignees;
  const names = await resolveCoMemberDisplayNames({
    admin: await createAdminClient(),
    wsId,
    viewerUserId,
    users: assignees.map((assignee) => ({
      id: assigneeUserId(assignee),
      display_name:
        typeof assignee.display_name === 'string'
          ? assignee.display_name
          : null,
    })),
  });
  return assignees.map((assignee) => {
    const id = assigneeUserId(assignee);
    const name = id ? names.get(id) : undefined;
    return name ? { ...assignee, display_name: name } : assignee;
  });
}

/**
 * GET /api/v1/workspaces/[wsId]/tasks/[taskId]/snapshot/[historyId]
 * Returns the reconstructed task state at a specific history point
 */
export async function GET(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ wsId: string; taskId: string; historyId: string }>;
  }
) {
  try {
    const auth = await resolveSessionAuthContext(req, {
      allowAppSessionAuth: TASK_SNAPSHOT_ROUTE_APP_SESSION_AUTH,
    });
    if (!auth.ok) return auth.response;

    const { supabase, user } = auth;

    const { wsId: rawWsId, taskId, historyId } = await params;
    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

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
    const isAppSession = Boolean(getAppSessionTokenFromRequest(req));
    const snapshotArgs = {
      p_ws_id: wsId,
      p_task_id: taskId,
      p_history_id: historyId,
    };
    // The actor wrappers land with this route. Keep this narrow escape local
    // until generated database types are refreshed after the migration runs.
    const snapshotRpc = (supabase.rpc as unknown as SnapshotRpc).bind(supabase);
    const { data: taskSnapshot, error: snapshotError } =
      await snapshotRpc<WorkspaceTask>(
        isAppSession
          ? 'get_task_snapshot_at_history_for_actor'
          : 'get_task_snapshot_at_history',
        isAppSession
          ? { ...snapshotArgs, p_actor_user_id: user.id }
          : snapshotArgs
      );

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
      await snapshotRpc<TaskRelationshipsSnapshot>(
        isAppSession
          ? 'get_task_relationships_at_snapshot_for_actor'
          : 'get_task_relationships_at_snapshot',
        isAppSession
          ? { ...snapshotArgs, p_actor_user_id: user.id }
          : snapshotArgs
      );

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
      .select(
        'id, changed_at, change_type, field_name, changed_by, old_value, new_value, metadata'
      )
      .eq('id', historyId)
      .single();

    const historicalTaskSnapshot = getSnapshotBeforeSelectedChange(
      taskSnapshot as unknown as Record<string, unknown> | null,
      historyEntry
    );
    const historicalRelationships = getRelationshipsBeforeSelectedChange(
      relationshipsSnapshot,
      historyEntry
    );

    // Co-members without a name are shown by email (D246); the name lands
    // in the existing display_name field.
    const assignees = await withAssigneeNames(
      historicalRelationships.assignees || [],
      { wsId, viewerUserId: user.id }
    );

    // Merge task snapshot with relationships
    const fullSnapshot = {
      ...(historicalTaskSnapshot || {}),
      assignees,
      labels: historicalRelationships.labels || [],
      projects: historicalRelationships.projects || [],
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
