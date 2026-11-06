import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  assignTaskToCycle: vi.fn(),
  listTaskCycleTasks: vi.fn(),
  listWorkspaceTaskBacklog: vi.fn(),
  unassignTaskFromCycle: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/task-cycles', () => api);

import { internalApiCyclePlanningSource as source } from '../cycle-planning-api';

describe('internalApiCyclePlanningSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listTaskCycleTasks.mockResolvedValue({ tasks: [{ id: 't1' }] });
    api.listWorkspaceTaskBacklog.mockResolvedValue({ tasks: [] });
  });

  it('reads cycle tasks and the backlog through the helpers', async () => {
    await expect(source.listCycleTasks('ws', 'c1')).resolves.toEqual([
      { id: 't1' },
    ]);
    await expect(source.listBacklogTasks('ws')).resolves.toEqual([]);
    expect(api.listTaskCycleTasks).toHaveBeenCalledWith('ws', 'c1');
    expect(api.listWorkspaceTaskBacklog).toHaveBeenCalledWith('ws');
  });

  it('moves between cycles with a single assign', async () => {
    await source.moveTask({
      wsId: 'ws',
      taskId: 't1',
      fromCycleId: 'c1',
      toCycleId: 'c2',
    });

    expect(api.assignTaskToCycle).toHaveBeenCalledWith('ws', 'c2', 't1');
    expect(api.unassignTaskFromCycle).not.toHaveBeenCalled();
  });

  it('unassigns when moving to the backlog and ignores no-op moves', async () => {
    await source.moveTask({
      wsId: 'ws',
      taskId: 't1',
      fromCycleId: 'c1',
      toCycleId: null,
    });
    await source.moveTask({
      wsId: 'ws',
      taskId: 't1',
      fromCycleId: null,
      toCycleId: null,
    });

    expect(api.unassignTaskFromCycle).toHaveBeenCalledTimes(1);
    expect(api.unassignTaskFromCycle).toHaveBeenCalledWith('ws', 'c1', 't1');
    expect(api.assignTaskToCycle).not.toHaveBeenCalled();
  });
});
