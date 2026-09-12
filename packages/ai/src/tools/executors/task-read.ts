import type { MiraToolContext } from '../mira-tool-types';
import { getWorkspaceContextWorkspaceId } from '../workspace-context';
import { hasTaskAccess } from './scope-helpers';

export async function executeGetTask(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const taskId = args.taskId as string;
  if (!(await hasTaskAccess(ctx, taskId)))
    return { error: 'Task not found in the current workspace.' };
  const { data, error } = await ctx.supabase
    .from('tasks')
    .select(
      'id, name, description, priority, start_date, end_date, estimation_points, completed, completed_at, list_id, task_lists(id, name, workspace_boards(id, name, ws_id)), task_assignees(user_id), task_labels(label_id)'
    )
    .eq('id', taskId)
    .single();
  return error
    ? { error: error.message }
    : { task: data, workspaceId: getWorkspaceContextWorkspaceId(ctx) };
}

export async function executeSearchTasks(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const wsId = getWorkspaceContextWorkspaceId(ctx);
  const title = String(args.query ?? '').trim();
  if (!title) return { error: 'Provide a task title to search for.' };
  const page = Math.max(1, Number(args.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
  const query = title.replace(/[\\%_]/g, '\\$&');
  let builder = ctx.supabase
    .from('tasks')
    .select(
      'id, name, priority, start_date, end_date, completed, board_id, list_id, direct_board:workspace_boards!fk_tasks_board_id(id, name, ws_id), task_lists(id, name, workspace_boards!inner(id, name, ws_id))',
      { count: 'exact' }
    )
    .eq('direct_board.ws_id', wsId)
    .is('direct_board.archived_at', null)
    .is('direct_board.deleted_at', null)
    .eq('task_lists.workspace_boards.ws_id', wsId)
    .is('task_lists.workspace_boards.archived_at', null)
    .is('task_lists.workspace_boards.deleted_at', null)
    .eq('task_lists.archived', false)
    .eq('task_lists.deleted', false)
    // Board ownership takes precedence, matching getTaskScope. Nullable embeds
    // allow board-only tasks without admitting rows from another workspace.
    .or(
      'and(direct_board.not.is.null,list_id.is.null),and(direct_board.not.is.null,task_lists.not.is.null),and(board_id.is.null,task_lists.not.is.null)'
    )
    .is('deleted_at', null)
    .ilike('name', `%${query}%`)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range((page - 1) * limit, page * limit - 1);
  if (args.includeCompleted !== true)
    builder = builder
      .eq('completed', false)
      .is('completed_at', null)
      .is('closed_at', null);
  const { data, count, error } = await builder;
  return error
    ? { error: error.message }
    : {
        workspaceId: wsId,
        tasks: data,
        total: count,
        page,
        hasMore: page * limit < (count ?? 0),
      };
}
