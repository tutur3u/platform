import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { describe, expect, it } from 'vitest';
import { getTaskCardHydratingOpenOptions } from './task-card-open-options';

const task = {
  id: 'task-1',
  name: 'Visible task',
  description: '',
  list_id: 'list-1',
  display_number: 7,
  created_at: '2026-06-12T00:00:00.000Z',
  end_date: null,
  priority: 'normal',
} satisfies Task;

const list = {
  id: 'list-1',
  name: 'To Do',
  board_id: 'board-1',
  position: 0,
  status: 'not_started',
  color: 'BLUE',
  created_at: '2026-06-12T00:00:00.000Z',
  creator_id: 'user-1',
  archived: false,
  deleted: false,
} satisfies TaskList;

describe('getTaskCardHydratingOpenOptions', () => {
  it('opens external task cards from the visible snapshot while hydrating source details', () => {
    const externalTask = {
      ...task,
      source_workspace_id: 'source-workspace',
      source_board_id: 'source-board',
    } satisfies Task;

    expect(
      getTaskCardHydratingOpenOptions({
        task: externalTask,
        boardId: 'personal-board',
        availableLists: [list],
        effectiveWorkspaceId: 'personal-workspace',
        isPersonalWorkspace: true,
      })
    ).toEqual({
      initialTask: externalTask,
      boardId: 'source-board',
      availableLists: undefined,
      taskWsId: 'source-workspace',
      taskWorkspacePersonal: false,
    });
  });

  it('keeps local board metadata for non-source personal tasks', () => {
    expect(
      getTaskCardHydratingOpenOptions({
        task,
        boardId: 'board-1',
        availableLists: [list],
        effectiveWorkspaceId: 'workspace-1',
        isPersonalWorkspace: true,
      })
    ).toEqual({
      initialTask: task,
      boardId: 'board-1',
      availableLists: [list],
      taskWsId: 'workspace-1',
      taskWorkspacePersonal: true,
    });
  });
});
