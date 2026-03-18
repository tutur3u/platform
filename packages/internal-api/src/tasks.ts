import type { TaskProjectWithRelations } from '@tuturuuu/types';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type {
  CreateTaskRelationshipInput,
  RelatedTaskInfo,
  TaskRelationship,
  TaskRelationshipsResponse,
  TaskRelationshipType,
} from '@tuturuuu/types/primitives/TaskRelationship';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export interface InternalApiTaskProjectSummary {
  id: string;
  name: string;
  status: string | null;
}

export interface WorkspaceTaskUpdatePayload {
  name?: string;
  description?: string | null;
  priority?: TaskPriority | null;
  start_date?: string | null;
  end_date?: string | null;
  closed_at?: string | null;
  completed_at?: string | null;
  list_id?: string;
  estimation_points?: number | null;
  label_ids?: string[];
  assignee_ids?: string[];
  project_ids?: string[];
  completed?: boolean;
  deleted?: boolean;
  sort_key?: number;
}

export interface WorkspaceTaskApiTask extends Task {
  assignee_ids?: string[];
  label_ids?: string[];
  project_ids?: string[];
  description_yjs_state?: number[] | null;
  board_id?: string | null;
  deleted_at?: string;
  list_deleted?: boolean;
}

export interface WorkspaceTaskResponse {
  task: WorkspaceTaskApiTask;
}

export interface ListWorkspaceTasksOptions {
  boardId?: string;
  listId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface WorkspaceTasksResponse {
  tasks: WorkspaceTaskApiTask[];
}

export interface CreateWorkspaceTaskPayload {
  name: string;
  listId: string;
  description?: string | null;
  description_yjs_state?: number[] | null;
  priority?: TaskPriority | null;
  start_date?: string | null;
  end_date?: string | null;
  estimation_points?: number | null;
  label_ids?: string[];
  project_ids?: string[];
  assignee_ids?: string[];
}

interface TaskProjectApiRow {
  id?: string;
  name?: string;
  status?: string | null;
}

export async function listWorkspaceTaskProjects(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const projects = await client.json<TaskProjectApiRow[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-projects`,
    {
      query: {
        compact: true,
      },
      cache: 'no-store',
    }
  );

  return (projects ?? []).flatMap(
    (project): InternalApiTaskProjectSummary[] => {
      if (!project?.id || !project?.name) {
        return [];
      }

      return [
        {
          id: project.id,
          name: project.name,
          status: project.status ?? null,
        },
      ];
    }
  );
}

export async function listWorkspaceTaskProjectsByIds(
  workspaceId: string,
  projectIds: string[],
  options?: InternalApiClientOptions
) {
  if (projectIds.length === 0) {
    return [] as InternalApiTaskProjectSummary[];
  }

  const client = getInternalApiClient(options);
  const projects = await client.json<TaskProjectApiRow[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-projects`,
    {
      query: {
        compact: true,
        ids: projectIds.join(','),
      },
      cache: 'no-store',
    }
  );

  return (projects ?? []).flatMap(
    (project): InternalApiTaskProjectSummary[] => {
      if (!project?.id || !project?.name) {
        return [];
      }

      return [
        {
          id: project.id,
          name: project.name,
          status: project.status ?? null,
        },
      ];
    }
  );
}

export async function addWorkspaceTaskLabel(
  workspaceId: string,
  taskId: string,
  labelId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}/labels`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ labelId }),
      cache: 'no-store',
    }
  );
}

export async function removeWorkspaceTaskLabel(
  workspaceId: string,
  taskId: string,
  labelId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}/labels`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ labelId }),
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceTaskRelationships(
  workspaceId: string,
  taskId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TaskRelationshipsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}/relationships`,
    {
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceTasks(
  workspaceId: string,
  options?: ListWorkspaceTasksOptions,
  clientOptions?: InternalApiClientOptions
) {
  const client = getInternalApiClient(clientOptions);
  return client.json<WorkspaceTasksResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks`,
    {
      query: {
        boardId: options?.boardId,
        listId: options?.listId,
        q: options?.q,
        limit: options?.limit,
        offset: options?.offset,
      },
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceTask(
  workspaceId: string,
  taskId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceTaskResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceTask(
  workspaceId: string,
  payload: CreateWorkspaceTaskPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceTaskResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceTask(
  workspaceId: string,
  taskId: string,
  payload: WorkspaceTaskUpdatePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceTaskResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

interface WorkspaceTaskRelationshipResponse {
  relationship: TaskRelationship;
}

export async function createWorkspaceTaskRelationship(
  workspaceId: string,
  taskId: string,
  payload: CreateTaskRelationshipInput,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceTaskRelationshipResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}/relationships`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceTaskRelationship(
  workspaceId: string,
  taskId: string,
  payload: {
    source_task_id: string;
    target_task_id: string;
    type: TaskRelationshipType;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}/relationships`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceTaskProject(
  workspaceId: string,
  payload: { name: string; description?: string },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ id: string; name: string; status?: string | null }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-projects`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function resolveTaskProjectWorkspaceId(
  input: {
    boardId?: string | null;
    projectIds?: string[];
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ workspaceId?: string | null }>(
    '/api/v1/task-projects/resolve-workspace',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        boardId: input.boardId ?? undefined,
        projectIds: input.projectIds ?? [],
      }),
      cache: 'no-store',
    }
  );

  return payload.workspaceId ?? null;
}

export async function getWorkspaceTaskProject(
  workspaceId: string,
  projectId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<TaskProjectWithRelations>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-projects/${encodePathSegment(projectId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceTaskProjectTasks(
  workspaceId: string,
  projectId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ tasks: Task[]; lists: TaskList[] }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-projects/${encodePathSegment(projectId)}/tasks`,
    {
      cache: 'no-store',
    }
  );
}

export type { RelatedTaskInfo, TaskRelationshipsResponse };
