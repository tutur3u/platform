import 'server-only';

import type { MindBoardSummary } from '@tuturuuu/types/db';
import { callMindRpc } from './repository-rpc';
import type { CreateMindBoardInput, UpdateMindBoardInput } from './schemas';

export async function listMindBoards(wsId: string) {
  return (
    (await callMindRpc<MindBoardSummary[]>('mind_list_boards', {
      p_ws_id: wsId,
    })) ?? []
  );
}

export async function createMindBoard({
  input,
  userId,
  wsId,
}: {
  input: CreateMindBoardInput;
  userId: string;
  wsId: string;
}) {
  return callMindRpc<MindBoardSummary | null>('mind_create_board', {
    p_input: input,
    p_user_id: userId,
    p_ws_id: wsId,
  });
}

export async function updateMindBoard({
  boardId,
  input,
  wsId,
}: {
  boardId: string;
  input: UpdateMindBoardInput;
  wsId: string;
}) {
  return callMindRpc<MindBoardSummary | null>('mind_update_board', {
    p_board_id: boardId,
    p_input: input,
    p_ws_id: wsId,
  });
}

export async function archiveMindBoard(wsId: string, boardId: string) {
  return updateMindBoard({
    boardId,
    input: { status: 'archived' },
    wsId,
  });
}

export async function getMindBoardOnly(wsId: string, boardId: string) {
  return callMindRpc<MindBoardSummary | null>('mind_get_board', {
    p_board_id: boardId,
    p_ws_id: wsId,
  });
}
