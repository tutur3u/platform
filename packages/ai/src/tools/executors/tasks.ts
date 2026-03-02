import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Enums, TablesInsert, TablesUpdate } from '@tuturuuu/types';
import { parseTaskDateToUTCISO } from '@tuturuuu/utils/task-date-timezone';
import type { MiraToolContext } from '../mira-tools';
import { getWorkspaceContextWorkspaceId } from '../workspace-context';

type RpcTask = {
  task_id: string;
  task_name: string;
  task_priority: string | null;
  task_end_date: string | null;
  task_completed_at: string | null;
  task_closed_at: string | null;
};

const mapTask = (t: RpcTask) => ({
  id: t.task_id,
  name: t.task_name,
  priority: t.task_priority,
  dueDate: t.task_end_date,
});

export async function executeGetMyTasks(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const { userId, supabase } = ctx;
  const wsId = getWorkspaceContextWorkspaceId(ctx);
  const category = ((args.category ?? args.status) as string) || 'all';

  const { data: tasks, error } = await supabase.rpc(
    'get_user_accessible_tasks',
    {
      p_user_id: userId,
      p_ws_id: wsId,
      p_include_deleted: false,
      p_list_statuses: ['not_started', 'active', 'done'],
    }
  );

  if (error) return { error: error.message };

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const active = ((tasks as RpcTask[]) || []).filter(
    (t) => !t.task_completed_at && !t.task_closed_at
  );

  const overdue = active
    .filter((t) => t.task_end_date && t.task_end_date < now.toISOString())
    .map(mapTask)
    .slice(0, 30);

  const today = active
    .filter(
      (t) =>
        t.task_end_date &&
        t.task_end_date >= todayStart.toISOString() &&
        t.task_end_date <= todayEnd.toISOString()
    )
    .map(mapTask)
    .slice(0, 30);

  const upcoming = active
    .filter((t) => !t.task_end_date || t.task_end_date > todayEnd.toISOString())
    .map(mapTask)
    .slice(0, 30);

  const result: Record<string, unknown> = { totalActive: active.length };
  if (category === 'all' || category === 'overdue')
    result.overdue = { count: overdue.length, tasks: overdue };
  if (category === 'all' || category === 'today')
    result.today = { count: today.length, tasks: today };
  if (category === 'all' || category === 'upcoming')
    result.upcoming = { count: upcoming.length, tasks: upcoming };
  return result;
}

export async function executeCreateTask(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const { userId, supabase } = ctx;
  const wsId = getWorkspaceContextWorkspaceId(ctx);
  const name = args.name as string;
  const description = args.description as string | null;
  const priority = (args.priority as Enums<'task_priority'> | null) ?? null;
  const assignToSelf = (args.assignToSelf as boolean | undefined) !== false;

  let { data: board } = await supabase
    .from('workspace_boards')
    .select('id')
    .eq('ws_id', wsId)
    .limit(1)
    .single();

  if (!board) {
    const { data: newBoard, error: boardErr } = await supabase
      .from('workspace_boards')
      .insert({ name: 'Tasks', ws_id: wsId })
      .select('id')
      .single();
    if (boardErr || !newBoard)
      return {
        error: `Failed to create board: ${boardErr?.message ?? 'Unknown error'}`,
      };
    board = newBoard;
  }

  let { data: list } = await supabase
    .from('task_lists')
    .select('id')
    .eq('board_id', board.id)
    .eq('archived', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!list) {
    const { data: newList, error: listErr } = await supabase
      .from('task_lists')
      .insert({ name: 'To Do', board_id: board.id })
      .select('id')
      .single();
    if (listErr || !newList)
      return {
        error: `Failed to create list: ${listErr?.message ?? 'Unknown error'}`,
      };
    list = newList;
  }

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      name,
      description: description
        ? JSON.stringify({
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: description }],
              },
            ],
          })
        : null,
      list_id: list.id,
      priority,
      completed: false,
    })
    .select('id, name, priority, created_at')
    .single();

  if (error) return { error: error.message };

  if (assignToSelf && task) {
    const { error: assignErr } = await supabase
      .from('task_assignees')
      .insert({ task_id: task.id, user_id: userId });
    if (assignErr) {
      return {
        success: true,
        message: `Task "${name}" created, but auto-assignment failed: ${assignErr.message}`,
        task,
      };
    }
    return {
      success: true,
      message: `Task "${name}" created and assigned to you`,
      task,
    };
  }

  return {
    success: true,
    message: `Task "${name}" created (unassigned)`,
    task,
  };
}

export async function executeCompleteTask(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const taskId = args.taskId as string;

  const { error } = await ctx.supabase
    .from('tasks')
    .update({ completed: true, completed_at: new Date().toISOString() })
    .eq('id', taskId);

  if (error) return { error: error.message };
  return { success: true, message: 'Task marked as completed' };
}

// ── New CRUD tools ──

const UPDATE_TASK_FIELDS_HINT =
  'Accepted fields: taskId (or id), endDate (or dueDate, ISO), name, description, priority, startDate, listId, estimationPoints.';

export async function executeUpdateTask(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const taskId = (args.taskId ?? args.id) as string | undefined;
  if (!taskId) {
    return {
      error: `Task ID required. Use taskId or id. ${UPDATE_TASK_FIELDS_HINT}`,
    };
  }
  const updates: TablesUpdate<'tasks'> = {};

  if (args.name !== undefined) updates.name = args.name as string;
  if (args.description !== undefined) {
    const desc = args.description as string | null;
    updates.description = desc
      ? JSON.stringify({
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: desc }] },
          ],
        })
      : null;
  }
  if (args.priority !== undefined)
    updates.priority = args.priority as Enums<'task_priority'>;
  if (args.startDate !== undefined) {
    const v = args.startDate as string | null;
    updates.start_date =
      v == null
        ? null
        : ctx.timezone
          ? parseTaskDateToUTCISO(v, ctx.timezone, false)
          : v;
  }
  const endDateValue = args.endDate ?? args.dueDate;
  if (endDateValue !== undefined) {
    const v = endDateValue as string | null;
    updates.end_date =
      v == null
        ? null
        : ctx.timezone
          ? parseTaskDateToUTCISO(v, ctx.timezone, true)
          : v;
  }
  if (args.estimationPoints !== undefined)
    updates.estimation_points = args.estimationPoints as number;
  if (args.listId !== undefined) updates.list_id = args.listId as string;

  if (Object.keys(updates).length === 0) {
    return {
      success: true,
      message: `No fields to update. ${UPDATE_TASK_FIELDS_HINT}`,
    };
  }

  const { error } = await ctx.supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId);

  if (error) return { error: error.message };
  return { success: true, message: `Task ${taskId} updated` };
}

export async function executeDeleteTask(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const taskId = args.taskId as string;

  const { error } = await ctx.supabase
    .from('tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', taskId);

  if (error) return { error: error.message };
  return { success: true, message: `Task ${taskId} deleted` };
}

export async function executeListBoards(
  _args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const { data, error } = await ctx.supabase
    .from('workspace_boards')
    .select('id, name, created_at')
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx))
    .order('created_at', { ascending: true });

  if (error) return { error: error.message };
  return { count: data?.length ?? 0, boards: data ?? [] };
}

export async function executeCreateBoard(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const { data, error } = await ctx.supabase
    .from('workspace_boards')
    .insert({
      name: args.name as string,
      ws_id: getWorkspaceContextWorkspaceId(ctx),
    })
    .select('id, name')
    .single();

  if (error) return { error: error.message };
  return {
    success: true,
    message: `Board "${args.name}" created`,
    board: data,
  };
}

export async function executeUpdateBoard(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const boardId = args.boardId as string;
  const updates: Record<string, unknown> = {};

  if (args.name !== undefined) updates.name = args.name;

  if (Object.keys(updates).length === 0) {
    return { success: true, message: 'No fields to update' };
  }

  const { error } = await ctx.supabase
    .from('workspace_boards')
    .update(updates)
    .eq('id', boardId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));

  if (error) return { error: error.message };
  return { success: true, message: `Board ${boardId} updated` };
}

export async function executeDeleteBoard(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const boardId = args.boardId as string;

  const { error } = await ctx.supabase
    .from('workspace_boards')
    .delete()
    .eq('id', boardId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));

  if (error) return { error: error.message };
  return { success: true, message: `Board ${boardId} deleted` };
}

export async function executeListTaskLists(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const boardId = args.boardId as string;

  const { data, error } = await ctx.supabase
    .from('task_lists')
    .select('id, name, board_id, color, position, archived')
    .eq('board_id', boardId)
    .eq('archived', false)
    .order('position', { ascending: true });

  if (error) return { error: error.message };
  return { count: data?.length ?? 0, lists: data ?? [] };
}

export async function executeCreateTaskList(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const boardId = args.boardId as string;

  // Verify board belongs to workspace
  const { data: board } = await ctx.supabase
    .from('workspace_boards')
    .select('id')
    .eq('id', boardId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx))
    .single();

  if (!board) return { error: 'Board not found in this workspace' };

  const insertData: TablesInsert<'task_lists'> = {
    name: args.name as string,
    board_id: boardId,
  };
  if (args.color) insertData.color = args.color as string;

  const { data, error } = await ctx.supabase
    .from('task_lists')
    .insert(insertData)
    .select('id, name')
    .single();

  if (error) return { error: error.message };
  return { success: true, message: `List "${args.name}" created`, list: data };
}

export async function executeUpdateTaskList(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const listId = args.listId as string;
  const updates: TablesUpdate<'task_lists'> = {};

  if (args.name !== undefined) updates.name = args.name as string;
  if (args.color !== undefined) updates.color = args.color as string;
  if (args.position !== undefined) updates.position = args.position as number;

  if (Object.keys(updates).length === 0) {
    return { success: true, message: 'No fields to update' };
  }

  const { error } = await ctx.supabase
    .from('task_lists')
    .update(updates)
    .eq('id', listId);

  if (error) return { error: error.message };
  return { success: true, message: `List ${listId} updated` };
}

export async function executeDeleteTaskList(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const listId = args.listId as string;

  const { error } = await ctx.supabase
    .from('task_lists')
    .delete()
    .eq('id', listId);

  if (error) return { error: error.message };
  return { success: true, message: `List ${listId} deleted` };
}

export async function executeListTaskLabels(
  _args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const { data, error } = await ctx.supabase
    .from('workspace_task_labels')
    .select('id, name, color, ws_id')
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));

  if (error) return { error: error.message };
  return { count: data?.length ?? 0, labels: data ?? [] };
}

export async function executeCreateTaskLabel(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const insertData: TablesInsert<'workspace_task_labels'> = {
    name: args.name as string,
    ws_id: getWorkspaceContextWorkspaceId(ctx),
    color: (args.color as string) ?? '#3B82F6',
  };

  const { data, error } = await ctx.supabase
    .from('workspace_task_labels')
    .insert(insertData)
    .select('id, name, color')
    .single();

  if (error) return { error: error.message };
  return {
    success: true,
    message: `Label "${args.name}" created`,
    label: data,
  };
}

export async function executeUpdateTaskLabel(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const labelId = args.labelId as string;
  const updates: TablesUpdate<'workspace_task_labels'> = {};

  if (args.name !== undefined) updates.name = args.name as string;
  if (args.color !== undefined) updates.color = args.color as string;

  if (Object.keys(updates).length === 0) {
    return { success: true, message: 'No fields to update' };
  }

  const { error } = await ctx.supabase
    .from('workspace_task_labels')
    .update(updates)
    .eq('id', labelId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));

  if (error) return { error: error.message };
  return { success: true, message: `Label ${labelId} updated` };
}

export async function executeDeleteTaskLabel(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const labelId = args.labelId as string;

  const { error } = await ctx.supabase
    .from('workspace_task_labels')
    .delete()
    .eq('id', labelId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));

  if (error) return { error: error.message };
  return { success: true, message: `Label ${labelId} deleted` };
}

export async function executeAddTaskLabels(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const taskId = args.taskId as string;
  const labelIds = args.labelIds as string[];
  const uniqueLabelIds = [...new Set(labelIds)];

  if (uniqueLabelIds.length === 0) {
    return { success: true, message: 'No labels provided' };
  }

  const { data: task, error: taskError } = await ctx.supabase
    .from('tasks')
    .select('id')
    .eq('id', taskId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx))
    .maybeSingle();

  if (taskError) return { error: taskError.message };
  if (!task) {
    return {
      error: 'Authorization failed: task does not belong to this workspace',
    };
  }

  const { data: labels, error: labelsError } = await ctx.supabase
    .from('workspace_task_labels')
    .select('id')
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx))
    .in('id', uniqueLabelIds);

  if (labelsError) return { error: labelsError.message };
  if ((labels?.length ?? 0) !== uniqueLabelIds.length) {
    return {
      error:
        'Authorization failed: one or more labels do not belong to this workspace',
    };
  }

  const rows: TablesInsert<'task_labels'>[] = uniqueLabelIds.map((labelId) => ({
    task_id: taskId,
    label_id: labelId,
  }));

  const { error } = await ctx.supabase
    .from('task_labels')
    .upsert(rows, { onConflict: 'task_id,label_id' });

  if (error) return { error: error.message };
  return {
    success: true,
    message: `${uniqueLabelIds.length} label(s) added to task`,
  };
}

export async function executeRemoveTaskLabels(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const taskId = args.taskId as string;
  const labelIds = args.labelIds as string[];
  const uniqueLabelIds = [...new Set(labelIds)];

  if (uniqueLabelIds.length === 0) {
    return { success: true, message: 'No labels provided' };
  }

  const { data: task, error: taskError } = await ctx.supabase
    .from('tasks')
    .select('id')
    .eq('id', taskId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx))
    .maybeSingle();

  if (taskError) return { error: taskError.message };
  if (!task) {
    return {
      error: 'Authorization failed: task does not belong to this workspace',
    };
  }

  const { data: labels, error: labelsError } = await ctx.supabase
    .from('workspace_task_labels')
    .select('id')
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx))
    .in('id', uniqueLabelIds);

  if (labelsError) return { error: labelsError.message };
  if ((labels?.length ?? 0) !== uniqueLabelIds.length) {
    return {
      error:
        'Authorization failed: one or more labels do not belong to this workspace',
    };
  }

  const { error } = await ctx.supabase
    .from('task_labels')
    .delete()
    .eq('task_id', taskId)
    .in('label_id', uniqueLabelIds);

  if (error) return { error: error.message };
  return {
    success: true,
    message: `${uniqueLabelIds.length} label(s) removed from task`,
  };
}

export async function executeListProjects(
  _args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const { data, error } = await ctx.supabase
    .from('task_projects')
    .select('id, name, description, created_at')
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx))
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };
  return { count: data?.length ?? 0, projects: data ?? [] };
}

export async function executeCreateProject(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const insertData: TablesInsert<'task_projects'> = {
    name: args.name as string,
    ws_id: getWorkspaceContextWorkspaceId(ctx),
  };
  if (args.description) insertData.description = args.description as string;

  const { data, error } = await ctx.supabase
    .from('task_projects')
    .insert(insertData)
    .select('id, name')
    .single();

  if (error) return { error: error.message };
  return {
    success: true,
    message: `Project "${args.name}" created`,
    project: data,
  };
}

export async function executeUpdateProject(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const projectId = args.projectId as string;
  const updates: TablesUpdate<'task_projects'> = {};

  if (args.name !== undefined) updates.name = args.name as string;
  if (args.description !== undefined)
    updates.description = args.description as string;

  if (Object.keys(updates).length === 0) {
    return { success: true, message: 'No fields to update' };
  }

  const { error } = await ctx.supabase
    .from('task_projects')
    .update(updates)
    .eq('id', projectId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));

  if (error) return { error: error.message };
  return { success: true, message: `Project ${projectId} updated` };
}

export async function executeDeleteProject(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const projectId = args.projectId as string;

  const { error } = await ctx.supabase
    .from('task_projects')
    .delete()
    .eq('id', projectId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx));

  if (error) return { error: error.message };
  return { success: true, message: `Project ${projectId} deleted` };
}

export async function executeAddTaskToProject(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const { error } = await ctx.supabase.from('task_project_tasks').upsert(
    {
      task_id: args.taskId as string,
      project_id: args.projectId as string,
    },
    { onConflict: 'task_id,project_id' }
  );

  if (error) return { error: error.message };
  return { success: true, message: 'Task linked to project' };
}

export async function executeRemoveTaskFromProject(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const { error } = await ctx.supabase
    .from('task_project_tasks')
    .delete()
    .eq('task_id', args.taskId as string)
    .eq('project_id', args.projectId as string);

  if (error) return { error: error.message };
  return { success: true, message: 'Task unlinked from project' };
}

export async function executeAddTaskAssignee(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const { error } = await ctx.supabase.from('task_assignees').upsert(
    {
      task_id: args.taskId as string,
      user_id: args.userId as string,
    },
    { onConflict: 'task_id,user_id' }
  );

  if (error) return { error: error.message };
  return { success: true, message: 'Assignee added to task' };
}

export async function executeRemoveTaskAssignee(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const { error } = await ctx.supabase
    .from('task_assignees')
    .delete()
    .eq('task_id', args.taskId as string)
    .eq('user_id', args.userId as string);

  if (error) return { error: error.message };
  return { success: true, message: 'Assignee removed from task' };
}

// Re-export helper to resolve a default board + list for task creation
async function resolveDefaultBoardAndList(
  wsId: string,
  supabase: SupabaseClient
): Promise<{ boardId: string; listId: string } | { error: string }> {
  let { data: board } = await supabase
    .from('workspace_boards')
    .select('id')
    .eq('ws_id', wsId)
    .limit(1)
    .single();

  if (!board) {
    const { data: newBoard, error } = await supabase
      .from('workspace_boards')
      .insert({ name: 'Tasks', ws_id: wsId })
      .select('id')
      .single();
    if (error || !newBoard)
      return { error: `Failed to create board: ${error?.message}` };
    board = newBoard;
  }

  let { data: list } = await supabase
    .from('task_lists')
    .select('id')
    .eq('board_id', board.id)
    .eq('archived', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!list) {
    const { data: newList, error } = await supabase
      .from('task_lists')
      .insert({ name: 'To Do', board_id: board.id })
      .select('id')
      .single();
    if (error || !newList)
      return { error: `Failed to create list: ${error?.message}` };
    list = newList;
  }

  return { boardId: board.id, listId: list.id };
}

// Exported for potential reuse
// Exported for potential reuse
export { resolveDefaultBoardAndList };
