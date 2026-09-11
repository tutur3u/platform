import { InternalApiError } from '@tuturuuu/internal-api';
import { getWorkspaceTask } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmMissingBoardTasks } from './confirm-missing-board-tasks';

vi.mock('@tuturuuu/internal-api/tasks', () => ({ getWorkspaceTask: vi.fn() }));
const task = { id: 'saved', list_id: 'list-1' } as Task;
beforeEach(() => vi.mocked(getWorkspaceTask).mockReset());
describe('partial board page membership', () => {
  it('preserves a task displaced to a later page', async () => {
    vi.mocked(getWorkspaceTask).mockResolvedValue({ task } as never);
    expect(await confirmMissingBoardTasks('ws', 'list-1', [task])).toEqual(
      new Set()
    );
  });
  it('removes confirmed deleted records even when later pages remain', async () => {
    vi.mocked(getWorkspaceTask).mockRejectedValue(
      new InternalApiError('Gone', 404)
    );
    expect(await confirmMissingBoardTasks('ws', 'list-1', [task])).toEqual(
      new Set(['saved'])
    );
  });
  it('removes soft-deleted tasks and tasks moved out of the list', async () => {
    vi.mocked(getWorkspaceTask)
      .mockResolvedValueOnce({
        task: { ...task, deleted_at: '2026-09-11' },
      } as never)
      .mockResolvedValueOnce({ task: { ...task, list_id: 'list-2' } } as never);
    expect(await confirmMissingBoardTasks('ws', 'list-1', [task])).toEqual(
      new Set(['saved'])
    );
    expect(await confirmMissingBoardTasks('ws', 'list-1', [task])).toEqual(
      new Set(['saved'])
    );
  });
  it('preserves tasks on transient errors and skips external placements', async () => {
    vi.mocked(getWorkspaceTask).mockRejectedValue(
      new InternalApiError('Unavailable', 503)
    );
    expect(await confirmMissingBoardTasks('ws', 'list-1', [task])).toEqual(
      new Set()
    );
    vi.mocked(getWorkspaceTask).mockClear();
    await confirmMissingBoardTasks('ws', 'list-1', [
      { ...task, is_personal_external: true },
    ]);
    expect(getWorkspaceTask).not.toHaveBeenCalled();
  });
});
