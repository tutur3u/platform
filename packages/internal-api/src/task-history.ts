import type { Task } from '@tuturuuu/types/primitives/Task';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withTaskApiBaseUrl,
} from './client';

export type RevertibleTaskHistoryField =
  | 'name'
  | 'description'
  | 'priority'
  | 'start_date'
  | 'end_date'
  | 'estimation_points'
  | 'list_id'
  | 'completed'
  | 'assignees'
  | 'labels'
  | 'projects';

export interface RevertWorkspaceTaskHistoryPayload {
  historyId: string;
  fields: RevertibleTaskHistoryField[];
}

export interface RevertWorkspaceTaskHistoryResponse {
  success: boolean;
  revertedFields: RevertibleTaskHistoryField[];
  task: Task;
}

export interface WorkspaceTaskSnapshotResponse {
  snapshot: Record<string, unknown>;
  historyEntry: {
    id: string;
    changed_at: string;
    change_type: string;
    field_name: string | null;
  } | null;
}

function getTaskApiClient(options?: InternalApiClientOptions) {
  return getInternalApiClient(withTaskApiBaseUrl(options));
}

export async function revertWorkspaceTaskHistory(
  workspaceId: string,
  taskId: string,
  payload: RevertWorkspaceTaskHistoryPayload,
  clientOptions?: InternalApiClientOptions
) {
  const client = getTaskApiClient(clientOptions);
  return client.json<RevertWorkspaceTaskHistoryResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}/revert`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceTaskSnapshot(
  workspaceId: string,
  taskId: string,
  historyId: string,
  clientOptions?: InternalApiClientOptions
) {
  const client = getTaskApiClient(clientOptions);
  return client.json<WorkspaceTaskSnapshotResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/tasks/${encodePathSegment(taskId)}/snapshot/${encodePathSegment(historyId)}`,
    { cache: 'no-store' }
  );
}
