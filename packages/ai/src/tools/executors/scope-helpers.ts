import type { MiraToolContext } from '../mira-tools';
import { getWorkspaceContextWorkspaceId } from '../workspace-context';

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type TaskScope = {
  id: string;
  boardId: string | null;
  listId: string | null;
};

export async function hasWorkspaceBoardAccess(
  ctx: MiraToolContext,
  boardId: string
): Promise<boolean> {
  const { data, error } = await ctx.supabase
    .from('workspace_boards')
    .select('id')
    .eq('id', boardId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx))
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

export async function hasTaskListAccess(
  ctx: MiraToolContext,
  listId: string
): Promise<boolean> {
  const { data, error } = await ctx.supabase
    .from('task_lists')
    .select('id, workspace_boards!inner(ws_id)')
    .eq('id', listId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const board = normalizeRelation(
    data?.workspace_boards as { ws_id: string } | { ws_id: string }[] | null
  );

  return board?.ws_id === getWorkspaceContextWorkspaceId(ctx);
}

export async function hasTaskAccess(
  ctx: MiraToolContext,
  taskId: string
): Promise<boolean> {
  return Boolean(await getTaskScope(ctx, taskId));
}

export async function getTaskScope(
  ctx: MiraToolContext,
  taskId: string
): Promise<TaskScope | null> {
  const { data, error } = await ctx.supabase
    .from('tasks')
    .select('id, board_id, list_id')
    .eq('id', taskId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const taskScope: TaskScope = {
    id: data.id,
    boardId: data.board_id ?? null,
    listId: data.list_id ?? null,
  };

  if (taskScope.boardId) {
    if (await hasWorkspaceBoardAccess(ctx, taskScope.boardId)) {
      return taskScope;
    }
    return null;
  }

  if (taskScope.listId) {
    if (await hasTaskListAccess(ctx, taskScope.listId)) {
      return taskScope;
    }
  }

  return null;
}

export async function hasProjectAccess(
  ctx: MiraToolContext,
  projectId: string
): Promise<boolean> {
  const { data, error } = await ctx.supabase
    .from('task_projects')
    .select('id')
    .eq('id', projectId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx))
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

export async function hasWalletAccess(
  ctx: MiraToolContext,
  walletId: string
): Promise<boolean> {
  const { data, error } = await ctx.supabase
    .from('workspace_wallets')
    .select('id')
    .eq('id', walletId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx))
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

export async function hasTransactionCategoryAccess(
  ctx: MiraToolContext,
  categoryId: string
): Promise<boolean> {
  const { data, error } = await ctx.supabase
    .from('transaction_categories')
    .select('id')
    .eq('id', categoryId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx))
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

export async function hasTimeTrackingCategoryAccess(
  ctx: MiraToolContext,
  categoryId: string
): Promise<boolean> {
  const { data, error } = await ctx.supabase
    .from('time_tracking_categories')
    .select('id')
    .eq('id', categoryId)
    .eq('ws_id', getWorkspaceContextWorkspaceId(ctx))
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

export async function isWorkspaceMember(
  ctx: MiraToolContext,
  userId: string,
  workspaceId = getWorkspaceContextWorkspaceId(ctx)
): Promise<boolean> {
  const { data, error } = await ctx.supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}
