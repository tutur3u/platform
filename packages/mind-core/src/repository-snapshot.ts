import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type {
  MindAiPatchRecord,
  MindBoardSnapshot,
  MindNode,
} from '@tuturuuu/types/db';
import { callMindRpc } from './repository-rpc';
import { mapPatch, type PatchRow } from './repository-types';

type MindPatchListQueryResult = {
  data: unknown;
  error: { message?: string } | null;
};

type MindPatchListQuery = PromiseLike<MindPatchListQueryResult> & {
  eq(column: string, value: string): MindPatchListQuery;
  limit(count: number): MindPatchListQuery;
  order(column: string, options: { ascending: boolean }): MindPatchListQuery;
};

type MindPatchListTableClient = {
  from(table: string): {
    select(columns: string): MindPatchListQuery;
  };
};

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
  try {
    return await callMindRpc<MindBoardSnapshot | null>(
      'mind_get_board_graph_snapshot',
      {
        p_board_id: boardId,
        p_ws_id: wsId,
      }
    );
  } catch (error) {
    if (!isUnavailableMindRpcError(error)) {
      throw error;
    }

    const snapshot = await getMindBoardSnapshot(wsId, boardId);
    return snapshot ? toGraphSnapshot(snapshot) : null;
  }
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
  try {
    return (
      (await callMindRpc<MindAiPatchRecord[]>('mind_list_ai_patches', {
        p_board_id: boardId,
        p_limit: limit,
        p_ws_id: wsId,
      })) ?? []
    );
  } catch {
    // Keep draft refresh working if production's private RPC schema cache lags.
    return listMindAiPatchesFromTable({ boardId, limit, wsId });
  }
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

async function listMindAiPatchesFromTable({
  boardId,
  limit,
  wsId,
}: {
  boardId: string;
  limit: number;
  wsId: string;
}) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const privateClient = getPrivateTableClient(sbAdmin);
  const { data, error } = await privateClient
    .from('mind_ai_patches')
    .select(
      [
        'id',
        'thread_id',
        'board_id',
        'created_by',
        'summary',
        'patch',
        'status',
        'applied_at',
        'created_at',
      ].join(',')
    )
    .eq('board_id', boardId)
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false })
    .limit(normalizePatchLimit(limit));

  if (error) {
    throw new Error(error.message ?? 'Failed to load Mind AI patches');
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((row) => mapPatch(row as PatchRow));
}

function getPrivateTableClient(client: unknown) {
  if (isRecord(client) && typeof client.schema === 'function') {
    return client.schema('private') as MindPatchListTableClient;
  }

  return client as MindPatchListTableClient;
}

function normalizePatchLimit(limit: number) {
  if (!Number.isFinite(limit)) return 20;
  return Math.max(0, Math.min(Math.trunc(limit), 100));
}

function toGraphSnapshot(
  snapshot: MindBoardSnapshot & { patches?: MindAiPatchRecord[] }
): MindBoardSnapshot {
  return {
    board: snapshot.board,
    edges: snapshot.edges,
    groups: snapshot.groups,
    links: snapshot.links,
    nodes: snapshot.nodes,
    tags: snapshot.tags,
  };
}

function isUnavailableMindRpcError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  return (
    /could not find (?:the )?function/i.test(message) ||
    /function .* does not exist/i.test(message) ||
    /permission denied for function/i.test(message) ||
    /schema cache/i.test(message) ||
    /PGRST20[23]/u.test(message)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
