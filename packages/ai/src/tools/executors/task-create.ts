import type { Enums } from '@tuturuuu/types';
import { parseTaskDateToUTCISO } from '@tuturuuu/utils/task-date-timezone';
import type { MiraToolContext } from '../mira-tool-types';
import { getWorkspaceContextWorkspaceId } from '../workspace-context';

export async function executeCreateTask(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const { supabase } = ctx;
  const wsId = getWorkspaceContextWorkspaceId(ctx);
  const boardIdArg = args.boardId as string | undefined;
  const listIdArg = args.listId as string | undefined;

  // If listId is provided directly, validate it exists and use it
  if (listIdArg) {
    const { data: targetList } = await supabase
      .from('task_lists')
      .select('id, board_id, workspace_boards!inner(ws_id)')
      .eq('id', listIdArg)
      .eq('archived', false)
      .eq('deleted', false)
      .single();

    if (!targetList) {
      return {
        error: `Task list "${listIdArg}" not found or archived. Use list_task_lists to discover valid lists.`,
      };
    }

    const relation = targetList.workspace_boards as unknown as
      | { ws_id: string }
      | { ws_id: string }[];
    const listWsId = (Array.isArray(relation) ? relation[0] : relation)?.ws_id;
    if (listWsId !== wsId) {
      return {
        error: `Task list does not belong to the current workspace context. Switch workspace first with set_workspace_context.`,
      };
    }

    if (boardIdArg && targetList.board_id !== boardIdArg) {
      return { error: 'The list does not belong to the specified board.' };
    }
    return persistTask(args, ctx, listIdArg);
  }

  // Resolve board: use provided boardId or fall back to first workspace board
  let board: { id: string } | null = null;

  if (boardIdArg) {
    const { data: targetBoard } = await supabase
      .from('workspace_boards')
      .select('id')
      .eq('id', boardIdArg)
      .eq('ws_id', wsId)
      .is('deleted_at', null)
      .is('archived_at', null)
      .single();

    if (!targetBoard) {
      return {
        error: `Board "${boardIdArg}" not found in this workspace. Use list_boards to discover valid boards.`,
      };
    }
    board = targetBoard;
  } else {
    const { data: firstBoard, error: lookupError } = await supabase
      .from('workspace_boards')
      .select('id')
      .eq('ws_id', wsId)
      .is('deleted_at', null)
      .is('archived_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (lookupError) return { error: lookupError.message };
    board = firstBoard;
  }

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

  let { data: list, error: lookupError } = await supabase
    .from('task_lists')
    .select('id')
    .eq('board_id', board.id)
    .not('status', 'in', '(done,closed)')
    .eq('archived', false)
    .eq('deleted', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (lookupError) return { error: lookupError.message };

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

  return persistTask(args, ctx, list.id);
}

async function persistTask(
  args: Record<string, unknown>,
  ctx: MiraToolContext,
  listId: string
) {
  const { userId, supabase } = ctx;
  const name = args.name as string;
  const description = args.description as string | null;
  const priority = (args.priority as Enums<'task_priority'> | null) ?? null;
  const assignToSelf = args.assignToSelf !== false;
  const date = (value: unknown, end: boolean) =>
    typeof value === 'string'
      ? ctx.timezone
        ? parseTaskDateToUTCISO(value, ctx.timezone, end)
        : value
      : null;
  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      creator_id: userId,
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
      list_id: listId,
      priority,
      start_date: date(args.startDate, false),
      end_date: date(args.endDate ?? args.dueDate, true),
      estimation_points: (args.estimationPoints as number | null) ?? null,
      completed: false,
    })
    .select('id')
    .single();
  if (error || !task)
    return {
      success: false,
      error: error?.message ?? 'Task creation returned no saved task.',
    };

  let assignmentError: string | undefined;
  if (assignToSelf) {
    const { error } = await supabase
      .from('task_assignees')
      .insert({ task_id: task.id, user_id: userId });
    assignmentError = error?.message;
  }
  // Read the saved row and its location before claiming completion. Never retry
  // a write when this read fails: the ID is returned for recovery instead.
  const { data: saved, error: readError } = await supabase
    .from('tasks')
    .select(
      'id, name, priority, start_date, end_date, estimation_points, created_at, task_lists!inner(id, name, workspace_boards!inner(id, name, ws_id))'
    )
    .eq('id', task.id)
    .single();
  if (readError || !saved)
    return {
      success: false,
      created: true,
      taskId: task.id,
      error:
        'Task was inserted but its saved details could not be verified. Do not create it again; retrieve this task ID.',
      ...(assignmentError ? { assignmentError } : {}),
    };
  return {
    success: !assignmentError,
    created: true,
    task: saved,
    workspaceId: getWorkspaceContextWorkspaceId(ctx),
    assignedToSelf: assignToSelf && !assignmentError,
    ...(assignmentError
      ? {
          error: `Task was created, but assignment failed: ${assignmentError}. Retry assignment only, never creation.`,
        }
      : {}),
    message:
      'Use the saved task ID, location and due date in your confirmation. Do not claim any fields absent from this result.',
  };
}
