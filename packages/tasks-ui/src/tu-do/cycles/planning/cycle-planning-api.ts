import {
  encodePathSegment,
  getInternalApiClient,
  withTaskApiBaseUrl,
} from '@tuturuuu/internal-api/client';
import type { CyclePlanningTask } from './types';

/**
 * Everything the cycle view reads and writes. The view takes this as a
 * dependency so tests and other hosts can supply their own.
 */
export interface CyclePlanningDataSource {
  listCycleTasks: (
    wsId: string,
    cycleId: string
  ) => Promise<CyclePlanningTask[]>;
  listBacklogTasks: (wsId: string) => Promise<CyclePlanningTask[]>;
  /** Move one task; `null` on either side means the backlog. */
  moveTask: (input: {
    wsId: string;
    taskId: string;
    fromCycleId: string | null;
    toCycleId: string | null;
  }) => Promise<void>;
}

function client() {
  return getInternalApiClient(withTaskApiBaseUrl());
}

function cycleTasksPath(wsId: string, cycleId: string) {
  return `/api/v1/workspaces/${encodePathSegment(wsId)}/task-cycles/${encodePathSegment(cycleId)}/tasks`;
}

/**
 * Integration point with the cycle data lane: replace these calls with the
 * `@tuturuuu/internal-api` cycle helpers (assign, unassign, backlog) once
 * they land. Endpoint shapes follow the sprint-planning proposal.
 */
export const internalApiCyclePlanningSource: CyclePlanningDataSource = {
  async listCycleTasks(wsId, cycleId) {
    const payload = await client().json<{ tasks: CyclePlanningTask[] }>(
      cycleTasksPath(wsId, cycleId),
      { cache: 'no-store' }
    );
    return payload.tasks ?? [];
  },
  async listBacklogTasks(wsId) {
    const payload = await client().json<{ tasks: CyclePlanningTask[] }>(
      `/api/v1/workspaces/${encodePathSegment(wsId)}/task-cycles/backlog`,
      { cache: 'no-store' }
    );
    return payload.tasks ?? [];
  },
  async moveTask({ wsId, taskId, fromCycleId, toCycleId }) {
    if (fromCycleId === toCycleId) return;
    const body = JSON.stringify({ taskId });
    const headers = { 'Content-Type': 'application/json' };
    if (fromCycleId) {
      await client().json(cycleTasksPath(wsId, fromCycleId), {
        method: 'DELETE',
        headers,
        body,
      });
    }
    if (toCycleId) {
      await client().json(cycleTasksPath(wsId, toCycleId), {
        method: 'POST',
        headers,
        body,
      });
    }
  },
};
