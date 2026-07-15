import {
  encodePathSegment,
  getInternalApiClient,
} from '@tuturuuu/internal-api/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Task } from '@tuturuuu/types/primitives/Task';

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

interface WorkspaceTaskTemplatesResponse {
  templates: WorkspaceTaskTemplate[];
}

interface WorkspaceTaskTemplateResponse {
  template: WorkspaceTaskTemplate;
}

interface InstantiateWorkspaceTaskTemplateResponse {
  task: Task;
  template: WorkspaceTaskTemplate;
}

function taskTemplatePath(workspaceId: string, suffix = '') {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-templates${suffix}`;
}

export async function listWorkspaceTaskTemplates(workspaceId: string) {
  return getInternalApiClient().json<WorkspaceTaskTemplatesResponse>(
    taskTemplatePath(workspaceId),
    { cache: 'no-store' }
  );
}

export async function createWorkspaceTaskTemplate(
  workspaceId: string,
  payload: WorkspaceTaskTemplatePayload
) {
  return getInternalApiClient().json<WorkspaceTaskTemplateResponse>(
    taskTemplatePath(workspaceId),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function deleteWorkspaceTaskTemplate(
  workspaceId: string,
  templateKey: string
) {
  return getInternalApiClient().json<{ success: true }>(
    taskTemplatePath(workspaceId, `/${encodePathSegment(templateKey)}`),
    { cache: 'no-store', method: 'DELETE' }
  );
}

export async function instantiateWorkspaceTaskTemplate(
  workspaceId: string,
  templateKey: string,
  payload: { listId: string; name?: string }
) {
  return getInternalApiClient().json<InstantiateWorkspaceTaskTemplateResponse>(
    taskTemplatePath(
      workspaceId,
      `/${encodePathSegment(templateKey)}/instantiate`
    ),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function saveWorkspaceTaskTemplateFromTask(
  workspaceId: string,
  payload: {
    name?: string;
    taskId: string;
    visibility: WorkspaceTaskTemplateVisibility;
  }
) {
  return getInternalApiClient().json<WorkspaceTaskTemplateResponse>(
    taskTemplatePath(workspaceId, '/from-task'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}
