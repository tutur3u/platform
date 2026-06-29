import type { TypedSupabaseClient } from '@tuturuuu/supabase';

export const DEFAULT_PERSONAL_TASK_BOARD_NAME = 'Tasks';
const DEFAULT_PERSONAL_TASK_BOARD_NORMALIZED_NAME = normalizeTaskBoardName(
  DEFAULT_PERSONAL_TASK_BOARD_NAME
);

interface EnsureDefaultPersonalTaskBoardParams {
  sbAdmin: TypedSupabaseClient;
  userId: string;
  wsId: string;
}

function normalizeTaskBoardName(name: string | null | undefined) {
  return (name ?? '').trim().toLowerCase();
}

function isUniqueViolation(error: unknown) {
  return (
    error !== null &&
    error !== undefined &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '23505'
  );
}

function isDefaultPersonalTaskBoard(board: { name?: string | null }) {
  return (
    normalizeTaskBoardName(board.name) ===
    DEFAULT_PERSONAL_TASK_BOARD_NORMALIZED_NAME
  );
}

async function findDefaultPersonalTaskBoard({
  sbAdmin,
  wsId,
}: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const { data, error } = await sbAdmin
    .from('workspace_boards')
    .select('*')
    .eq('ws_id', wsId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).find(isDefaultPersonalTaskBoard) ?? null;
}

export async function ensureDefaultPersonalTaskBoard({
  sbAdmin,
  userId,
  wsId,
}: EnsureDefaultPersonalTaskBoardParams) {
  const { data: workspace, error: workspaceError } = await sbAdmin
    .from('workspaces')
    .select('id, personal')
    .eq('id', wsId)
    .maybeSingle();

  if (workspaceError) throw workspaceError;
  if (!workspace?.personal) return null;

  const existingBoard = await findDefaultPersonalTaskBoard({ sbAdmin, wsId });
  if (existingBoard) return existingBoard;

  const { data: board, error: insertError } = await sbAdmin
    .from('workspace_boards')
    .insert({
      creator_id: userId,
      name: DEFAULT_PERSONAL_TASK_BOARD_NAME,
      ws_id: wsId,
    })
    .select('*')
    .single();

  if (insertError) {
    if (!isUniqueViolation(insertError)) throw insertError;

    const racedBoard = await findDefaultPersonalTaskBoard({ sbAdmin, wsId });
    if (racedBoard) return racedBoard;

    throw insertError;
  }

  return board;
}
