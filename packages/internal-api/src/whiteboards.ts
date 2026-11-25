import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

/** A workspace whiteboard as the list endpoint returns it (no snapshot). */
export interface WorkspaceWhiteboardSummary {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  creator_name: string | null;
}

/** A whiteboard with its stored snapshot, as the detail endpoint returns it. */
export interface WorkspaceWhiteboardDetail {
  id: string;
  title: string;
  description: string | null;
  snapshot: unknown;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface WorkspaceWhiteboardInput {
  title: string;
  description?: string | null;
}

export interface WorkspaceWhiteboardPatch {
  title?: string;
  description?: string | null;
  snapshot?: unknown;
  archived_at?: string | null;
  updated_at?: string;
}

export interface WorkspaceWhiteboardImageUpload {
  signedUrl?: string;
  token?: string;
  headers?: Record<string, string>;
  path?: string;
  fullPath?: string | null;
  contentType?: string;
  provider?: 'r2' | 'supabase';
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

function whiteboardsPath(workspaceId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/whiteboards`;
}

function whiteboardPath(workspaceId: string, boardId: string) {
  return `${whiteboardsPath(workspaceId)}/${encodePathSegment(boardId)}`;
}

export async function listWorkspaceWhiteboards(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const payload = await getInternalApiClient(options).json<{
    whiteboards: WorkspaceWhiteboardSummary[];
  }>(whiteboardsPath(workspaceId), { cache: 'no-store' });

  return payload.whiteboards;
}

export async function getWorkspaceWhiteboard(
  workspaceId: string,
  boardId: string,
  options?: InternalApiClientOptions
) {
  const payload = await getInternalApiClient(options).json<{
    whiteboard: WorkspaceWhiteboardDetail;
  }>(whiteboardPath(workspaceId, boardId), { cache: 'no-store' });

  return payload.whiteboard;
}

export async function createWorkspaceWhiteboard(
  workspaceId: string,
  input: WorkspaceWhiteboardInput,
  options?: InternalApiClientOptions
) {
  const payload = await getInternalApiClient(options).json<{
    whiteboard: Omit<WorkspaceWhiteboardSummary, 'creator_name'>;
  }>(whiteboardsPath(workspaceId), {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
    cache: 'no-store',
  });

  return payload.whiteboard;
}

export async function updateWorkspaceWhiteboard(
  workspaceId: string,
  boardId: string,
  patch: WorkspaceWhiteboardPatch,
  options?: InternalApiClientOptions
) {
  const payload = await getInternalApiClient(options).json<{
    whiteboard: WorkspaceWhiteboardDetail;
  }>(whiteboardPath(workspaceId, boardId), {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
    cache: 'no-store',
  });

  return payload.whiteboard;
}

export async function deleteWorkspaceWhiteboard(
  workspaceId: string,
  boardId: string,
  options?: InternalApiClientOptions
) {
  await getInternalApiClient(options).json<{ success: boolean }>(
    whiteboardPath(workspaceId, boardId),
    { method: 'DELETE', cache: 'no-store' }
  );
}

/** Asks for a signed storage URL to upload one image of the board. */
export function createWhiteboardImageUploadUrl(
  workspaceId: string,
  boardId: string,
  filename: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<WorkspaceWhiteboardImageUpload>(
    `${whiteboardPath(workspaceId, boardId)}/image-url`,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ filename }),
      cache: 'no-store',
    }
  );
}

/** Resolves a signed read URL for a stored board image, or null when gone. */
export async function getWhiteboardImageSignedUrl(
  workspaceId: string,
  boardId: string,
  path: string,
  options?: InternalApiClientOptions
) {
  try {
    const payload = await getInternalApiClient(options).json<{
      signedUrl?: string;
    }>(
      `${whiteboardPath(workspaceId, boardId)}/image-url?path=${encodeURIComponent(path)}`,
      { cache: 'no-store' }
    );

    return payload.signedUrl ?? null;
  } catch {
    return null;
  }
}
