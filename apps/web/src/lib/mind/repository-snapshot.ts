import 'server-only';

import type {
  MindAiPatchRecord,
  MindBoardSnapshot,
  MindNode,
} from '@tuturuuu/types/db';
import { callMindRpc } from './repository-rpc';

export async function getMindBoardSnapshot(
  wsId: string,
  boardId: string
): Promise<(MindBoardSnapshot & { patches: MindAiPatchRecord[] }) | null> {
  return callMindRpc<MindBoardSnapshot & { patches: MindAiPatchRecord[] }>(
    'mind_get_board_snapshot',
    {
      p_board_id: boardId,
      p_ws_id: wsId,
    }
  );
}

export async function getMindBoardGraphSnapshot(
  wsId: string,
  boardId: string
): Promise<MindBoardSnapshot | null> {
  return callMindRpc<MindBoardSnapshot | null>(
    'mind_get_board_graph_snapshot',
    {
      p_board_id: boardId,
      p_ws_id: wsId,
    }
  );
}

export async function listMindAiPatches({
  boardId,
  limit = 20,
  wsId,
}: {
  boardId: string;
  limit?: number;
  wsId: string;
}) {
  return (
    (await callMindRpc<MindAiPatchRecord[]>('mind_list_ai_patches', {
      p_board_id: boardId,
      p_limit: limit,
      p_ws_id: wsId,
    })) ?? []
  );
}

export async function searchMindNodes({
  boardId,
  q,
  wsId,
}: {
  boardId?: string;
  q?: string;
  wsId: string;
}) {
  return (
    (await callMindRpc<MindNode[]>('mind_search_nodes', {
      p_board_id: boardId ?? null,
      p_q: q ?? null,
      p_ws_id: wsId,
    })) ?? []
  );
}
