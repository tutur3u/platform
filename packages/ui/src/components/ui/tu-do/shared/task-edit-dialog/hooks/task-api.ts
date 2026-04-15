import {
  createWorkspaceTaskProject,
  getWorkspaceTask,
  updateWorkspaceTask as updateWorkspaceTaskViaApi,
  type WorkspaceTaskUpdatePayload,
} from '@tuturuuu/internal-api/tasks';
import type { WorkspaceTaskLabel } from '../types';

async function getErrorMessage(
  response: Response,
  fallback: string,
  options?: {
    requestPath?: string;
    isDescriptionRequest?: boolean;
  }
) {
  const isDescriptionRequest =
    options?.isDescriptionRequest ??
    Boolean(options?.requestPath?.includes('/description'));

  if (response.status === 413 && isDescriptionRequest) {
    return 'Description content is too large. Please shorten it or split it into smaller documents.';
  }

  const payload = await response.json().catch(() => null);
  return typeof payload?.error === 'string' ? payload.error : fallback;
}

export async function updateWorkspaceTask(
  wsId: string,
  taskId: string,
  payload: WorkspaceTaskUpdatePayload
) {
  return updateWorkspaceTaskViaApi(wsId, taskId, payload);
}

export async function fetchWorkspaceTask(wsId: string, taskId: string) {
  return getWorkspaceTask(wsId, taskId);
}

interface TaskDescriptionResponse {
  description: string | null;
  description_yjs_state: number[] | null;
}

export async function fetchWorkspaceTaskDescription(
  wsId: string,
  taskId: string
) {
  const requestPath = `/api/v1/workspaces/${wsId}/tasks/${taskId}/description`;
  const response = await fetch(requestPath, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Failed to fetch task description', {
        requestPath,
      })
    );
  }

  return (await response.json()) as TaskDescriptionResponse;
}

export async function updateWorkspaceTaskDescription(
  wsId: string,
  taskId: string,
  payload: {
    description?: string | null;
    description_yjs_state?: number[] | null;
  }
) {
  const requestPath = `/api/v1/workspaces/${wsId}/tasks/${taskId}/description`;
  const response = await fetch(requestPath, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Failed to update task description', {
        requestPath,
      })
    );
  }

  return (await response.json()) as TaskDescriptionResponse;
}

export async function createWorkspaceLabel(
  wsId: string,
  payload: { name: string; color: string }
) {
  const response = await fetch(`/api/v1/workspaces/${wsId}/labels`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to create label'));
  }

  return (await response.json()) as WorkspaceTaskLabel;
}

export async function createWorkspaceProject(
  wsId: string,
  payload: { name: string; description?: string }
) {
  try {
    return await createWorkspaceTaskProject(wsId, payload);
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Failed to create project'
    );
  }
}
