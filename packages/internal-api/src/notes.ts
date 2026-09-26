import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type WorkspaceNote = {
  id: string;
  title: string | null;
  content: Record<string, unknown>;
  archived: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

function path(wsId: string, noteId?: string) {
  const base = `/api/v1/workspaces/${encodePathSegment(wsId)}/notes`;
  return noteId ? `${base}/${encodePathSegment(noteId)}` : base;
}

export function listWorkspaceNotes(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<WorkspaceNote[]>(path(wsId));
}

export function createWorkspaceNote(
  wsId: string,
  note: { title?: string; content: Record<string, unknown> },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<WorkspaceNote>(path(wsId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(note),
  });
}

export function updateWorkspaceNote(
  wsId: string,
  noteId: string,
  changes: {
    title?: string;
    content?: Record<string, unknown>;
    archived?: boolean;
  },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<WorkspaceNote>(path(wsId, noteId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
}

export function deleteWorkspaceNote(
  wsId: string,
  noteId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ success: boolean }>(
    path(wsId, noteId),
    {
      method: 'DELETE',
    }
  );
}
