import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withTaskApiBaseUrl,
} from './client';
import type { WorkspaceTaskProject } from './tasks';

function getTaskApiClient(options?: InternalApiClientOptions) {
  return getInternalApiClient(withTaskApiBaseUrl(options));
}

export async function createWorkspaceTaskProject(
  workspaceId: string,
  payload: { name: string; description?: string; ticket_key?: string },
  options?: InternalApiClientOptions
) {
  const client = getTaskApiClient(options);
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
export async function updateWorkspaceTaskProject(
  workspaceId: string,
  projectId: string,
  payload: {
    name?: string;
    ticket_key?: string;
    description?: string | null;
    priority?: string | null;
    health_status?: string | null;
    status?: string | null;
    lead_id?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    archived?: boolean | null;
  },
  options?: InternalApiClientOptions
) {
  const client = getTaskApiClient(options);
  return client.json<WorkspaceTaskProject>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-projects/${encodePathSegment(projectId)}`,
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
