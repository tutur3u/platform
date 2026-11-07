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

/**
 * One planning row from the cycle-task and backlog endpoints. Structurally
 * matches `CyclePlanningTask` in `@tuturuuu/tasks-ui/tu-do/cycles/planning`.
 */
export interface TaskCyclePlanningTask {
  id: string;
  name: string;
  display_number: number | null;
  ticket_prefix: string | null;
  priority: TaskPriority | null;
  status: 'not_started' | 'active' | 'review' | 'done' | 'closed' | 'documents';
  board_id: string;
  cycle_id: string | null;
  assignees: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  }[];
  projects: { id: string; name: string }[];
  labels: { id: string; name: string }[];
}

export interface TaskCyclePlanningTasksResponse {
  tasks: TaskCyclePlanningTask[];
}

/** Lists the tasks in a cycle. */
export async function listTaskCycleTasks(
  workspaceId: string,
  cycleId: string,
  options?: InternalApiClientOptions
) {
  const client = getTaskApiClient(options);
  return client.json<TaskCyclePlanningTasksResponse>(
    cycleTasksPath(workspaceId, cycleId),
    { cache: 'no-store' }
  );
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
    cycleTasksPath(workspaceId, cycleId),
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
      cache: 'no-store',
    }
  );
}

/** Lists open tasks in the workspace that are in no cycle (max 500). */
export async function listWorkspaceTaskBacklog(
  workspaceId: string,
  query?: { limit?: number },
  options?: InternalApiClientOptions
) {
  const client = getTaskApiClient(options);
  return client.json<TaskCyclePlanningTasksResponse>(
    `${cyclesBasePath(workspaceId)}/backlog`,
    { cache: 'no-store', query }
  );
}
