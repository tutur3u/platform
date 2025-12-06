import type { WorkspaceTask } from '@tuturuuu/types/db';
import { createClient } from '@tuturuuu/supabase/next/server';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';

type TaskRelationshipsSnapshot = {
  assignees: { id: string; user_id: string }[];
  labels: { id: string }[];
  projects: { id: string }[];
};

// Valid fields that can be reverted
const REVERTIBLE_CORE_FIELDS = [
  'name',
  'description',
  'priority',
  'start_date',
  'end_date',
  'estimation_points',
  'list_id',
  'completed',
] as const;

const REVERTIBLE_RELATIONSHIP_FIELDS = [
  'assignees',
  'labels',
  'projects',
] as const;

const revertSchema = z.object({
  historyId: z.string().uuid('Invalid history ID'),
  fields: z
    .array(
      z.enum([...REVERTIBLE_CORE_FIELDS, ...REVERTIBLE_RELATIONSHIP_FIELDS])
    )
    .min(1, 'At least one field must be selected'),
});

/**
 * POST /api/v1/workspaces/[wsId]/tasks/[taskId]/revert
 * Selectively reverts task fields to a historical snapshot state
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
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

    const { wsId: rawWsId, taskId } = await params;
    const wsId = resolveWorkspaceId(rawWsId);

    // Validate UUID
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(taskId)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    // Parse and validate request body
    const body = await req.json();
    const validation = revertSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { historyId, fields } = validation.data;

    // Get the snapshot at the history point
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

      if (snapshotError.message === 'Access denied to workspace') {
        return NextResponse.json(
          { error: 'Access denied to workspace' },
          { status: 403 }
        );
      }
      if (snapshotError.message === 'Task not found') {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      if (snapshotError.message === 'History entry not found') {
        return NextResponse.json(
          { error: 'History entry not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to fetch snapshot' },
        { status: 500 }
      );
    }

    // Separate core fields from relationship fields
    const coreFields = fields.filter((f) =>
      REVERTIBLE_CORE_FIELDS.includes(
        f as (typeof REVERTIBLE_CORE_FIELDS)[number]
      )
    );
    const relationshipFields = fields.filter((f) =>
      REVERTIBLE_RELATIONSHIP_FIELDS.includes(
        f as (typeof REVERTIBLE_RELATIONSHIP_FIELDS)[number]
      )
    );

    // Build update object for core fields
    const coreUpdates: Record<string, unknown> = {};
    for (const field of coreFields) {
      if (
        taskSnapshot &&
        typeof taskSnapshot === 'object' &&
        field in taskSnapshot
      ) {
        coreUpdates[field] = taskSnapshot[field as keyof WorkspaceTask];
      }
    }

    // Apply core field updates if any
    if (Object.keys(coreUpdates).length > 0) {
      const { error: updateError } = await supabase
        .from('tasks')
        .update(coreUpdates)
        .eq('id', taskId);

      if (updateError) {
        console.error('Error reverting core fields:', updateError);
        return NextResponse.json(
          { error: 'Failed to revert core fields' },
          { status: 500 }
        );
      }
    }

    // Handle relationship field reverts
    if (relationshipFields.length > 0) {
      // Get relationships snapshot
      const { data: relationshipsSnapshot, error: relError } =
        (await supabase.rpc('get_task_relationships_at_snapshot', {
          p_ws_id: wsId,
          p_task_id: taskId,
          p_history_id: historyId,
        })) as { data: TaskRelationshipsSnapshot | null; error: Error | null };

      if (relError) {
        console.error('Error fetching relationships snapshot:', relError);
        return NextResponse.json(
          { error: 'Failed to fetch relationships snapshot' },
          { status: 500 }
        );
      }

      // Revert assignees
      if (relationshipFields.includes('assignees') && relationshipsSnapshot) {
        const targetAssignees = relationshipsSnapshot.assignees || [];
        const targetUserIds = targetAssignees.map((a) => a.user_id || a.id);

        // Get current assignees
        const { data: currentAssignees } = await supabase
          .from('task_assignees')
          .select('user_id')
          .eq('task_id', taskId);

        const currentUserIds = (currentAssignees || []).map((a) => a.user_id);

        // Remove assignees not in target
        const toRemove = currentUserIds.filter(
          (id) => !targetUserIds.includes(id)
        );
        if (toRemove.length > 0) {
          await supabase
            .from('task_assignees')
            .delete()
            .eq('task_id', taskId)
            .in('user_id', toRemove);
        }

        // Add assignees in target but not current
        const toAdd = targetUserIds.filter(
          (id) => !currentUserIds.includes(id)
        );
        if (toAdd.length > 0) {
          await supabase.from('task_assignees').insert(
            toAdd.map((userId) => ({
              task_id: taskId,
              user_id: userId,
            }))
          );
        }
      }

      // Revert labels
      if (relationshipFields.includes('labels') && relationshipsSnapshot) {
        const targetLabels = relationshipsSnapshot.labels || [];
        const targetLabelIds = targetLabels.map((l) => l.id);

        // Get current labels
        const { data: currentLabels } = await supabase
          .from('task_labels')
          .select('label_id')
          .eq('task_id', taskId);

        const currentLabelIds = (currentLabels || []).map((l) => l.label_id);

        // Remove labels not in target
        const toRemove = currentLabelIds.filter(
          (id) => !targetLabelIds.includes(id)
        );
        if (toRemove.length > 0) {
          await supabase
            .from('task_labels')
            .delete()
            .eq('task_id', taskId)
            .in('label_id', toRemove);
        }

        // Add labels in target but not current
        const toAdd = targetLabelIds.filter(
          (id) => !currentLabelIds.includes(id)
        );
        if (toAdd.length > 0) {
          await supabase.from('task_labels').insert(
            toAdd.map((labelId) => ({
              task_id: taskId,
              label_id: labelId,
            }))
          );
        }
      }

      // Revert projects
      if (relationshipFields.includes('projects') && relationshipsSnapshot) {
        const targetProjects = relationshipsSnapshot.projects || [];
        const targetProjectIds = targetProjects.map((p) => p.id);

        // Get current projects
        const { data: currentProjects } = await supabase
          .from('task_project_tasks')
          .select('project_id')
          .eq('task_id', taskId);

        const currentProjectIds = (currentProjects || []).map(
          (p) => p.project_id
        );

        // Remove projects not in target
        const toRemove = currentProjectIds.filter(
          (id) => !targetProjectIds.includes(id)
        );
        if (toRemove.length > 0) {
          await supabase
            .from('task_project_tasks')
            .delete()
            .eq('task_id', taskId)
            .in('project_id', toRemove);
        }

        // Add projects in target but not current
        const toAdd = targetProjectIds.filter(
          (id) => !currentProjectIds.includes(id)
        );
        if (toAdd.length > 0) {
          await supabase.from('task_project_tasks').insert(
            toAdd.map((projectId) => ({
              task_id: taskId,
              project_id: projectId,
            }))
          );
        }
      }
    }

    // Fetch updated task to return
    const { data: updatedTask, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (fetchError) {
      console.error('Error fetching updated task:', fetchError);
    }

    return NextResponse.json({
      success: true,
      revertedFields: fields,
      task: updatedTask,
    });
  } catch (error) {
    console.error('Error in task revert API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
