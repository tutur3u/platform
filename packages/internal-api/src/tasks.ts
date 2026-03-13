import type {
  RelatedTaskInfo,
  TaskRelationshipsResponse,
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

export type { RelatedTaskInfo, TaskRelationshipsResponse };
