import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withTaskApiBaseUrl,
} from './client';

function getTaskApiClient(options?: InternalApiClientOptions) {
  return getInternalApiClient(withTaskApiBaseUrl(options));
}

function cyclesBasePath(workspaceId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/task-cycles`;
}

function cycleTasksPath(workspaceId: string, cycleId: string) {
  return `${cyclesBasePath(workspaceId)}/${encodePathSegment(cycleId)}/tasks`;
}

export interface TaskCycleAssignment {
  taskId: string;
  cycleId: string | null;
}

export interface TaskBacklogItem {
  id: string;
  name: string;
  priority: TaskPriority | null;
  end_date: string | null;
  estimation_points: number | null;
  created_at: string | null;
  list: {
    id: string;
    name: string | null;
    status: 'not_started' | 'active' | 'review';
    board: { id: string; name: string | null; ws_id: string };
  };
}

export interface TaskBacklogResponse {
  tasks: TaskBacklogItem[];
}

/** Puts a task into a cycle. A task is in at most one cycle, so this moves it. */
export async function assignTaskToCycle(
  workspaceId: string,
  cycleId: string,
  taskId: string,
  options?: InternalApiClientOptions
) {
  const client = getTaskApiClient(options);
  return client.json<TaskCycleAssignment>(
    cycleTasksPath(workspaceId, cycleId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
      cache: 'no-store',
    }
  );
}

/** Returns a task from a cycle to the workspace backlog. */
export async function unassignTaskFromCycle(
  workspaceId: string,
  cycleId: string,
  taskId: string,
  options?: InternalApiClientOptions
) {
  const client = getTaskApiClient(options);
  return client.json<TaskCycleAssignment>(
    `${cycleTasksPath(workspaceId, cycleId)}/${encodePathSegment(taskId)}`,
    { method: 'DELETE', cache: 'no-store' }
  );
}

/** Lists open tasks in the workspace that are in no cycle. */
export async function listWorkspaceTaskBacklog(
  workspaceId: string,
  query?: { limit?: number },
  options?: InternalApiClientOptions
) {
  const client = getTaskApiClient(options);
  return client.json<TaskBacklogResponse>(
    `${cyclesBasePath(workspaceId)}/backlog`,
    { cache: 'no-store', query }
  );
}
