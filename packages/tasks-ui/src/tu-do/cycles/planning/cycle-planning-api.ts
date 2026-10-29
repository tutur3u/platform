import {
  assignTaskToCycle,
  listTaskCycleTasks,
  listWorkspaceTaskBacklog,
  unassignTaskFromCycle,
} from '@tuturuuu/internal-api/task-cycles';
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

/** The cycle view's data source over the `@tuturuuu/internal-api` helpers. */
export const internalApiCyclePlanningSource: CyclePlanningDataSource = {
  async listCycleTasks(wsId, cycleId) {
    const payload = await listTaskCycleTasks(wsId, cycleId);
    return (payload.tasks ?? []) as CyclePlanningTask[];
  },
  async listBacklogTasks(wsId) {
    const payload = await listWorkspaceTaskBacklog(wsId);
    return (payload.tasks ?? []) as CyclePlanningTask[];
  },
  async moveTask({ wsId, taskId, fromCycleId, toCycleId }) {
    if (fromCycleId === toCycleId) return;
    // Assigning moves the task between cycles, so only a move to the backlog
    // needs an explicit removal.
    if (toCycleId) {
      await assignTaskToCycle(wsId, toCycleId, taskId);
      return;
    }
    if (fromCycleId) {
      await unassignTaskFromCycle(wsId, fromCycleId, taskId);
    }
  },
};
