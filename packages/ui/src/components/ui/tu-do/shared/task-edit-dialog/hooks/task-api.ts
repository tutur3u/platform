import { createWorkspaceTaskProject } from '@tuturuuu/internal-api/tasks';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { WorkspaceTaskLabel } from '../types';

export interface WorkspaceTaskUpdatePayload {
  name?: string;
  description?: string | null;
  priority?: TaskPriority | null;
  start_date?: string | null;
  end_date?: string | null;
  list_id?: string;
  estimation_points?: number | null;
  label_ids?: string[];
  assignee_ids?: string[];
  project_ids?: string[];
  completed?: boolean;
  deleted?: boolean;
}

interface TaskResponse {
  task: Task & {
    assignee_ids?: string[];
    label_ids?: string[];
    project_ids?: string[];
  };
}

async function getErrorMessage(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  return typeof payload?.error === 'string' ? payload.error : fallback;
}

export async function updateWorkspaceTask(
  wsId: string,
  taskId: string,
  payload: WorkspaceTaskUpdatePayload
) {
  const response = await fetch(`/api/v1/workspaces/${wsId}/tasks/${taskId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to update task'));
  }

  return (await response.json()) as TaskResponse;
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
