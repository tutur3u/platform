import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { isTaskPriority } from '@tuturuuu/types/primitives/Priority';
import type {
  RelatedTaskInfo,
  TaskRelationshipsResponse,
} from '@tuturuuu/types/primitives/TaskRelationship';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const paramsSchema = z.object({
  wsId: z.string().min(1),
  taskId: z.uuid(),
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
    const wsId = await normalizeWorkspaceId(parsedParams.data.wsId, supabase);
    const taskId = parsedParams.data.taskId;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership) {
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
              name
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
              name
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

    for (const relationship of (sourceRelationships ??
      []) as SourceRelationshipRow[]) {
      const targetTask = relationship.target_task;
      if (!targetTask || targetTask.deleted_at !== null) {
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

    for (const relationship of (targetRelationships ??
      []) as TargetRelationshipRow[]) {
      const sourceTask = relationship.source_task;
      if (!sourceTask || sourceTask.deleted_at !== null) {
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
    console.error('Error in task relationships GET route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
