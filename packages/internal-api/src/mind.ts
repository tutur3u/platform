import type {
  MindAiPatchRecord,
  MindBoardSnapshot,
  MindBoardSummary,
  MindEdge,
  MindNode,
} from '@tuturuuu/types/db';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type CreateMindBoardPayload = {
  defaultHorizon?: MindBoardSummary['defaultHorizon'];
  description?: string | null;
  title: string;
};

export type UpdateMindBoardPayload = Partial<CreateMindBoardPayload> & {
  canvasView?: MindBoardSummary['canvasView'];
  settings?: MindBoardSummary['settings'];
  status?: MindBoardSummary['status'];
};

export type SaveMindGraphPayload = {
  deletedEdgeIds?: string[];
  deletedNodeIds?: string[];
  edges: Array<
    Pick<MindEdge, 'id' | 'sourceNodeId' | 'targetNodeId'> & Partial<MindEdge>
  >;
  nodes: Array<
    Pick<MindNode, 'id' | 'positionX' | 'positionY' | 'title'> &
      Partial<MindNode>
  >;
};

export type MindBoardListResponse = {
  boards: MindBoardSummary[];
};

export type MindBoardResponse = {
  board: MindBoardSummary;
};

export type MindBoardSnapshotResponse = MindBoardSnapshot & {
  patches: MindAiPatchRecord[];
};

export type MindBoardGraphSnapshotResponse = MindBoardSnapshot;

export type MindAiPatchListResponse = {
  patches: MindAiPatchRecord[];
};

export type MindNodeSearchParams = {
  boardId?: string;
  q?: string;
};

export type MindNodeSearchResponse = {
  nodes: MindNode[];
};

function workspaceMindPath(workspaceId: string, path = '') {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/mind${path}`;
}

export async function listMindBoards(
  options?: InternalApiClientOptions & { workspaceId?: string }
) {
  const workspaceId = options?.workspaceId ?? 'personal';
  const client = getInternalApiClient(options);

  return client.json<MindBoardListResponse>(
    workspaceMindPath(workspaceId, '/boards'),
    {
      cache: 'no-store',
    }
  );
}

export async function createMindBoard(
  payload: CreateMindBoardPayload,
  options?: InternalApiClientOptions & { workspaceId?: string }
) {
  const workspaceId = options?.workspaceId ?? 'personal';
  const client = getInternalApiClient(options);

  return client.json<MindBoardResponse>(
    workspaceMindPath(workspaceId, '/boards'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function getMindBoardSnapshot(
  workspaceId: string,
  boardId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<MindBoardSnapshotResponse>(
    workspaceMindPath(workspaceId, `/boards/${encodePathSegment(boardId)}`),
    { cache: 'no-store' }
  );
}

export async function getMindBoardGraphSnapshot(
  workspaceId: string,
  boardId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<MindBoardGraphSnapshotResponse>(
    workspaceMindPath(
      workspaceId,
      `/boards/${encodePathSegment(boardId)}/graph`
    ),
    { cache: 'no-store' }
  );
}

export async function listMindAiPatches(
  workspaceId: string,
  boardId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<MindAiPatchListResponse>(
    workspaceMindPath(
      workspaceId,
      `/boards/${encodePathSegment(boardId)}/patches`
    ),
    { cache: 'no-store' }
  );
}

export async function updateMindBoard(
  workspaceId: string,
  boardId: string,
  payload: UpdateMindBoardPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<MindBoardResponse>(
    workspaceMindPath(workspaceId, `/boards/${encodePathSegment(boardId)}`),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}

export async function archiveMindBoard(
  workspaceId: string,
  boardId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<MindBoardResponse>(
    workspaceMindPath(workspaceId, `/boards/${encodePathSegment(boardId)}`),
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function saveMindGraph(
  workspaceId: string,
  boardId: string,
  payload: SaveMindGraphPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<MindBoardGraphSnapshotResponse>(
    workspaceMindPath(
      workspaceId,
      `/boards/${encodePathSegment(boardId)}/graph`
    ),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    }
  );
}

export async function searchMindNodes(
  workspaceId: string,
  params: MindNodeSearchParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<MindNodeSearchResponse>(
    workspaceMindPath(workspaceId, '/search'),
    {
      cache: 'no-store',
      query: params,
    }
  );
}

export async function applyMindAiPatch(
  workspaceId: string,
  patchId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<{ patch: MindAiPatchRecord }>(
    workspaceMindPath(
      workspaceId,
      `/ai/patches/${encodePathSegment(patchId)}/apply`
    ),
    {
      cache: 'no-store',
      method: 'POST',
    }
  );
}
