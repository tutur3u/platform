import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { isTaskPriority } from '@tuturuuu/types/primitives/Priority';
import type {
  RelatedTaskInfo,
  TaskRelationshipsResponse,
} from '@tuturuuu/types/primitives/TaskRelationship';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const paramsSchema = z.object({
  wsId: z.string().min(1),
  taskId: z.guid(),
});

const relationshipMutationSchema = z.object({
  source_task_id: z.guid(),
  target_task_id: z.guid(),
  type: z.enum(['parent_child', 'blocks', 'related']),
});

interface RelationshipTaskRow {
  id: string;
  name: string;
  display_number: number | null;
  completed_at: string | null;
  closed_at: string | null;
  priority: string | null;
  board_id: string | null;
  deleted_at: string | null;
  list: {
    board: {
      name: string;
      ticket_prefix: string | null;
      ws_id: string | null;
    } | null;
  } | null;
}

interface SourceRelationshipRow {
  type: 'parent_child' | 'blocks' | 'related';
  target_task: RelationshipTaskRow | null;
}

interface TargetRelationshipRow {
  type: 'parent_child' | 'blocks' | 'related';
  source_task: RelationshipTaskRow | null;
}

async function getWorkspaceTaskRow(
  sbAdmin: TypedSupabaseClient,
  taskId: string
) {
  return sbAdmin
    .from('tasks')
    .select(
      `
        id,
        list:task_lists!inner(
          board:workspace_boards!inner(
            ws_id
          )
        )
      `
    )
    .eq('id', taskId)
    .is('deleted_at', null)
    .maybeSingle();
}

function toTaskInfo(task: RelationshipTaskRow): RelatedTaskInfo {
  return {
    id: task.id,
    name: task.name,
    display_number: task.display_number,
    completed: !!task.closed_at || !!task.completed_at,
    priority: isTaskPriority(task.priority)
      ? (task.priority as RelatedTaskInfo['priority'])
      : null,
    board_id: task.board_id,
    board_name: task.list?.board?.name,
    ticket_prefix: task.list?.board?.ticket_prefix ?? null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const parsedParams = paramsSchema.safeParse(await params);

    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient(request);
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(parsedParams.data.wsId, supabase);
    const taskId = parsedParams.data.taskId;

    const membership = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();

    const { data: taskRow, error: taskError } = await sbAdmin
      .from('tasks')
      .select(
        `
        id,
        list:task_lists!inner(
          board:workspace_boards!inner(
            ws_id
          )
        )
      `
      )
      .eq('id', taskId)
      .is('deleted_at', null)
      .maybeSingle();

    if (taskError) {
      return NextResponse.json(
        { error: 'Failed to load task' },
        { status: 500 }
      );
    }

    if (!taskRow || taskRow.list?.board?.ws_id !== wsId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const { data: sourceRelationships, error: sourceError } = await sbAdmin
      .from('task_relationships')
      .select(
        `
        type,
        target_task:tasks!task_relationships_target_task_id_fkey(
          id,
          name,
          display_number,
          completed_at,
          closed_at,
          priority,
          board_id,
          deleted_at,
          list:task_lists(
            board:workspace_boards(
              name,
              ticket_prefix,
              ws_id
            )
          )
        )
      `
      )
      .eq('source_task_id', taskId);

    if (sourceError) {
      return NextResponse.json(
        { error: 'Failed to load task relationships' },
        { status: 500 }
      );
    }

    const { data: targetRelationships, error: targetError } = await sbAdmin
      .from('task_relationships')
      .select(
        `
        type,
        source_task:tasks!task_relationships_source_task_id_fkey(
          id,
          name,
          display_number,
          completed_at,
          closed_at,
          priority,
          board_id,
          deleted_at,
          list:task_lists(
            board:workspace_boards(
              name,
              ticket_prefix,
              ws_id
            )
          )
        )
      `
      )
      .eq('target_task_id', taskId);

    if (targetError) {
      return NextResponse.json(
        { error: 'Failed to load task relationships' },
        { status: 500 }
      );
    }

    const result: TaskRelationshipsResponse = {
      parentTask: null,
      childTasks: [],
      blockedBy: [],
      blocking: [],
      relatedTasks: [],
    };

    for (const relationship of sourceRelationships as SourceRelationshipRow[]) {
      const targetTask = relationship.target_task;
      if (
        !targetTask ||
        targetTask.deleted_at !== null ||
        targetTask.list?.board?.ws_id !== wsId
      ) {
        continue;
      }

      const taskInfo = toTaskInfo(targetTask);

      switch (relationship.type) {
        case 'parent_child':
          result.childTasks.push(taskInfo);
          break;
        case 'blocks':
          result.blocking.push(taskInfo);
          break;
        case 'related':
          result.relatedTasks.push(taskInfo);
          break;
      }
    }

    for (const relationship of targetRelationships as TargetRelationshipRow[]) {
      const sourceTask = relationship.source_task;
      if (
        !sourceTask ||
        sourceTask.deleted_at !== null ||
        sourceTask.list?.board?.ws_id !== wsId
      ) {
        continue;
      }

      const taskInfo = toTaskInfo(sourceTask);

      switch (relationship.type) {
        case 'parent_child':
          result.parentTask = taskInfo;
          break;
        case 'blocks':
          result.blockedBy.push(taskInfo);
          break;
        case 'related':
          if (!result.relatedTasks.some((task) => task.id === taskInfo.id)) {
            result.relatedTasks.push(taskInfo);
          }
          break;
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching task relationships:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient(request);
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(parsedParams.data.wsId, supabase);
    const taskId = parsedParams.data.taskId;

    const membership = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsedBody = relationshipMutationSchema.safeParse(
      await request.json()
    );
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const payload = parsedBody.data;
    const isSourceTask = payload.source_task_id === taskId;
    const isTargetTask = payload.target_task_id === taskId;

    if (!isSourceTask && !isTargetTask) {
      return NextResponse.json({ error: 'Task ID mismatch' }, { status: 400 });
    }

    const sbAdmin = await createAdminClient();

    const { data: taskRow, error: taskError } = await getWorkspaceTaskRow(
      sbAdmin,
      taskId
    );

    if (taskError) {
      return NextResponse.json(
        { error: 'Failed to load task' },
        { status: 500 }
      );
    }

    if (!taskRow || taskRow.list?.board?.ws_id !== wsId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const otherTaskId = isSourceTask
      ? payload.target_task_id
      : payload.source_task_id;

    if (otherTaskId !== taskId) {
      const { data: otherTask, error: otherTaskError } =
        await getWorkspaceTaskRow(sbAdmin, otherTaskId);

      if (otherTaskError) {
        return NextResponse.json(
          { error: 'Failed to load related task' },
          { status: 500 }
        );
      }

      if (!otherTask || otherTask.list?.board?.ws_id !== wsId) {
        const notFoundMessage = isSourceTask
          ? 'Related task not found'
          : 'Source task not found';
        return NextResponse.json({ error: notFoundMessage }, { status: 404 });
      }
    }

    const { data: relationship, error: insertError } = await sbAdmin
      .from('task_relationships')
      .insert(payload)
      .select('id, source_task_id, target_task_id, type')
      .maybeSingle();

    if (insertError) {
      return NextResponse.json(
        { error: 'Failed to create relationship' },
        { status: 500 }
      );
    }

    if (!relationship) {
      return NextResponse.json(
        { error: 'Failed to create relationship' },
        { status: 500 }
      );
    }

    return NextResponse.json({ relationship });
  } catch (error) {
    console.error('Error creating task relationship:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient(request);
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(parsedParams.data.wsId, supabase);
    const taskId = parsedParams.data.taskId;

    const membership = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsedBody = relationshipMutationSchema.safeParse(
      await request.json()
    );
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const payload = parsedBody.data;
    const isSourceTask = payload.source_task_id === taskId;
    const isTargetTask = payload.target_task_id === taskId;

    if (!isSourceTask && !isTargetTask) {
      return NextResponse.json({ error: 'Task ID mismatch' }, { status: 400 });
    }

    const sbAdmin = await createAdminClient();

    const { data: taskRow, error: taskError } = await getWorkspaceTaskRow(
      sbAdmin,
      taskId
    );

    if (taskError) {
      return NextResponse.json(
        { error: 'Failed to load task' },
        { status: 500 }
      );
    }

    if (!taskRow || taskRow.list?.board?.ws_id !== wsId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const otherTaskId = isSourceTask
      ? payload.target_task_id
      : payload.source_task_id;

    if (otherTaskId !== taskId) {
      const { data: otherTask, error: otherTaskError } =
        await getWorkspaceTaskRow(sbAdmin, otherTaskId);

      if (otherTaskError) {
        return NextResponse.json(
          { error: 'Failed to load related task' },
          { status: 500 }
        );
      }

      if (!otherTask || otherTask.list?.board?.ws_id !== wsId) {
        const notFoundMessage = isSourceTask
          ? 'Related task not found'
          : 'Source task not found';
        return NextResponse.json({ error: notFoundMessage }, { status: 404 });
      }
    }

    const deleteRelationship = async (
      sourceTaskId: string,
      targetTaskId: string
    ) =>
      sbAdmin
        .from('task_relationships')
        .delete({ count: 'exact' })
        .eq('source_task_id', sourceTaskId)
        .eq('target_task_id', targetTaskId)
        .eq('type', payload.type);

    const { count: deletedForwardCount, error: deleteForwardError } =
      await deleteRelationship(payload.source_task_id, payload.target_task_id);

    if (deleteForwardError) {
      return NextResponse.json(
        { error: 'Failed to delete relationship' },
        { status: 500 }
      );
    }

    let deletedReverseCount = 0;

    if (payload.type === 'related') {
      const { count, error: reverseDeleteError } = await deleteRelationship(
        payload.target_task_id,
        payload.source_task_id
      );

      if (reverseDeleteError) {
        return NextResponse.json(
          { error: 'Failed to delete relationship' },
          { status: 500 }
        );
      }

      deletedReverseCount = count ?? 0;
    }

    const deletedCount = (deletedForwardCount ?? 0) + deletedReverseCount;

    if (deletedCount <= 0) {
      return NextResponse.json(
        { error: 'Relationship not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting task relationship:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
