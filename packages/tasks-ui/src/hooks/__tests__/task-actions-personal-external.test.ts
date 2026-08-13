import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { describe, expect, it } from 'vitest';
import { shouldMoveExternalTaskToCompletion } from '../task-actions-personal-external';

const doneList = {
  id: 'personal-done',
  status: 'done',
} as TaskList;

describe('shouldMoveExternalTaskToCompletion', () => {
  it('retries personal placement when the source is completed but the personal task is still active', () => {
    const task = {
      id: 'task-1',
      is_personal_external: true,
      list_id: 'personal-delegated',
      personal_board_id: 'personal-board',
      personal_list_id: 'personal-delegated',
      source_board_id: 'source-board',
      source_list_id: 'source-done',
      source_list_status: 'done',
      closed_at: '2026-08-13T00:00:00.000Z',
    } as Task;

    expect(shouldMoveExternalTaskToCompletion(task, doneList)).toBe(true);
  });

  it('does not repeat completion after the personal task reaches Done', () => {
    const task = {
      id: 'task-1',
      is_personal_external: true,
      list_id: 'personal-done',
      personal_board_id: 'personal-board',
      personal_list_id: 'personal-done',
    } as Task;

    expect(shouldMoveExternalTaskToCompletion(task, doneList)).toBe(false);
  });
});
