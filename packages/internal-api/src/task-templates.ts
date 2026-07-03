import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Task } from '@tuturuuu/types/primitives/Task';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withTaskApiBaseUrl,
} from './client';

function getTaskApiClient(options?: InternalApiClientOptions) {
  return getInternalApiClient(withTaskApiBaseUrl(options));
}

export type WorkspaceTaskTemplateVisibility = 'private' | 'workspace';

export interface WorkspaceTaskTemplate {
  archived_at: string | null;
  assignee_ids: string[];
  created_at: string;
  created_by: string;
  default_board_id: string | null;
  default_list_id: string | null;
  description: string | null;
  description_yjs_state: number[] | null;
  end_date: string | null;
  estimation_points: number | null;
  id: string;
  isOwner: boolean;
  label_ids: string[];
  name: string;
  priority: TaskPriority | null;
  project_ids: string[];
  slug: string;
  source_task_id: string | null;
  start_date: string | null;
  task_name: string;
  updated_at: string;
  visibility: WorkspaceTaskTemplateVisibility;
  ws_id: string;
}

export interface ListWorkspaceTaskTemplatesOptions {
  includeArchived?: boolean;
  q?: string;
  visibility?: WorkspaceTaskTemplateVisibility;
}

export interface WorkspaceTaskTemplatePayload {
  assignee_ids?: string[];
  default_board_id?: string | null;
  default_list_id?: string | null;
  description?: string | null;
  description_yjs_state?: number[] | null;
  end_date?: string | null;
  estimation_points?: number | null;
  key?: string;
  label_ids?: string[];
  name: string;
  priority?: TaskPriority | null;
  project_ids?: string[];
  slug?: string;
  source_task_id?: string | null;
  start_date?: string | null;
  task_name?: string;
  title?: string;
  visibility?: WorkspaceTaskTemplateVisibility;
}

export type UpdateWorkspaceTaskTemplatePayload =
  Partial<WorkspaceTaskTemplatePayload> & {
    archived?: boolean;
  };

export interface InstantiateWorkspaceTaskTemplatePayload {
  assignee_ids?: string[];
  description?: string | null;
  description_yjs_state?: number[] | null;
  end_date?: string | null;
  estimation_points?: number | null;
  label_ids?: string[];
  listId?: string;
  list_id?: string;
  name?: string;
  priority?: TaskPriority | null;
  project_ids?: string[];
  start_date?: string | null;
  task_name?: string;
  title?: string;
}

export interface SaveWorkspaceTaskTemplateFromTaskPayload {
  key?: string;
  name?: string;
  slug?: string;
  taskId?: string;
  task_id?: string;
  visibility?: WorkspaceTaskTemplateVisibility;
}

export interface WorkspaceTaskTemplatesResponse {
  templates: WorkspaceTaskTemplate[];
}

export interface WorkspaceTaskTemplateResponse {
  template: WorkspaceTaskTemplate;
}

export interface InstantiateWorkspaceTaskTemplateResponse {
  task: Task;
  template: WorkspaceTaskTemplate;
}

function taskTemplatePath(workspaceId: string, suffix = '') {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-templates${suffix}`;
}

export async function listWorkspaceTaskTemplates(
  workspaceId: string,
  options?: ListWorkspaceTaskTemplatesOptions,
  clientOptions?: InternalApiClientOptions
) {
  const client = getTaskApiClient(clientOptions);
  return client.json<WorkspaceTaskTemplatesResponse>(
    taskTemplatePath(workspaceId),
    {
      query: {
        includeArchived: options?.includeArchived,
        q: options?.q,
        visibility: options?.visibility,
      },
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceTaskTemplate(
  workspaceId: string,
  payload: WorkspaceTaskTemplatePayload,
  options?: InternalApiClientOptions
) {
  const client = getTaskApiClient(options);
  return client.json<WorkspaceTaskTemplateResponse>(
    taskTemplatePath(workspaceId),
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

export async function getWorkspaceTaskTemplate(
  workspaceId: string,
  templateKey: string,
  options?: InternalApiClientOptions
) {
  const client = getTaskApiClient(options);
  return client.json<WorkspaceTaskTemplateResponse>(
    taskTemplatePath(workspaceId, `/${encodePathSegment(templateKey)}`),
    {
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceTaskTemplate(
  workspaceId: string,
  templateKey: string,
  payload: UpdateWorkspaceTaskTemplatePayload,
  options?: InternalApiClientOptions
) {
  const client = getTaskApiClient(options);
  return client.json<WorkspaceTaskTemplateResponse>(
    taskTemplatePath(workspaceId, `/${encodePathSegment(templateKey)}`),
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function deleteWorkspaceTaskTemplate(
  workspaceId: string,
  templateKey: string,
  options?: { permanent?: boolean },
  clientOptions?: InternalApiClientOptions
) {
  const client = getTaskApiClient(clientOptions);
  return client.json<{ success: true }>(
    taskTemplatePath(workspaceId, `/${encodePathSegment(templateKey)}`),
    {
      method: 'DELETE',
      query: {
        permanent: options?.permanent,
      },
      cache: 'no-store',
    }
  );
}

export async function instantiateWorkspaceTaskTemplate(
  workspaceId: string,
  templateKey: string,
  payload: InstantiateWorkspaceTaskTemplatePayload,
  options?: InternalApiClientOptions
) {
  const client = getTaskApiClient(options);
  return client.json<InstantiateWorkspaceTaskTemplateResponse>(
    taskTemplatePath(
      workspaceId,
      `/${encodePathSegment(templateKey)}/instantiate`
    ),
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

export async function saveWorkspaceTaskTemplateFromTask(
  workspaceId: string,
  payload: SaveWorkspaceTaskTemplateFromTaskPayload,
  options?: InternalApiClientOptions
) {
  const client = getTaskApiClient(options);
  return client.json<WorkspaceTaskTemplateResponse>(
    taskTemplatePath(workspaceId, '/from-task'),
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
