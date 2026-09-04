/** @vitest-environment jsdom */

import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { beforeEach, describe, expect, it } from 'vitest';
import { readTaskBoardCache, writeTaskBoardCache } from './task-board-cache';

describe('task board cache', () => {
  beforeEach(() => localStorage.clear());

  it('scopes cached board data by workspace and board', () => {
    const board = {
      id: 'board-1',
      name: 'Roadmap',
      task_lists: [],
    } as unknown as WorkspaceTaskBoard;
    const tasks = [
      {
        id: 'task-1',
        name: 'Cached task',
        list_id: 'list-1',
        description: 'Large editor content is intentionally omitted',
      },
    ] as Task[];

    writeTaskBoardCache('ws-1', 'board-1', {
      board,
      pagination: {
        'list-1': {
          page: 0,
          hasMore: false,
          totalCount: 1,
          isLoading: true,
          isInitialLoad: true,
        },
      },
      tasks,
    });

    const cached = readTaskBoardCache('ws-1', 'board-1');
    expect(cached).toMatchObject({
      board: { id: 'board-1' },
      pagination: { 'list-1': { isInitialLoad: false } },
      tasks: [{ id: 'task-1' }],
    });
    expect(cached?.tasks[0]).not.toHaveProperty('description');
    expect(readTaskBoardCache('ws-2', 'board-1')).toBeNull();
  });

  it('ignores malformed and expired cache entries', () => {
    localStorage.setItem('tuturuuu:task-board-cache:ws-1:broken', '{');
    expect(readTaskBoardCache('ws-1', 'broken')).toBeNull();

    writeTaskBoardCache('ws-1', 'board-1', {
      board: { id: 'board-1' } as WorkspaceTaskBoard,
      pagination: {},
      tasks: [],
      updatedAt: 1,
    });
    expect(readTaskBoardCache('ws-1', 'board-1')).toBeNull();
  });
});
