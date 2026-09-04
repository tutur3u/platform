import type { WorkspaceTaskBoardWithLists } from '@tuturuuu/internal-api/tasks';
import { describe, expect, it } from 'vitest';
import {
  buildTaskCommandListOptions,
  parseTaskCommandQuery,
  selectQuickCreateTarget,
} from './task-command-utils';

describe('task command query parsing', () => {
  it('extracts first-class filters without losing search text', () => {
    expect(
      parseTaskCommandQuery('neo priority:high assignee:me is:open')
    ).toEqual({
      priority: 'high',
      query: 'neo',
      status: 'open',
      tokens: ['priority:high', 'assignee:me', 'is:open'],
    });
  });

  it('turns due presets into bounded API filters', () => {
    const now = new Date('2026-08-30T10:30:00.000Z');
    const expectedStart = new Date(now);
    expectedStart.setHours(0, 0, 0, 0);
    const expectedEnd = new Date(expectedStart);
    expectedEnd.setHours(23, 59, 59, 999);
    expect(
      buildTaskCommandListOptions(parseTaskCommandQuery('due:today'), now)
    ).toMatchObject({
      closed: 'exclude',
      completed: 'exclude',
      dueDateFrom: expectedStart.toISOString(),
      dueDateTo: expectedEnd.toISOString(),
    });
  });

  it('keeps unknown tokens as ordinary semantic search terms', () => {
    expect(parseTaskCommandQuery('owner:linh launch plan')).toMatchObject({
      priority: null,
      query: 'owner:linh launch plan',
      status: 'all',
      tokens: [],
    });
  });

  it('defaults the launcher to a compact list of recent open work', () => {
    expect(
      buildTaskCommandListOptions(parseTaskCommandQuery(''))
    ).toMatchObject({
      closed: 'exclude',
      completed: 'exclude',
      limit: 12,
    });
  });
});

describe('quick create target selection', () => {
  const boards = [
    {
      created_at: '2026-01-01',
      default_closed_list_id: null,
      default_done_list_id: null,
      default_list_id: 'todo-2',
      id: 'board-2',
      name: 'Launch',
      task_lists: [
        {
          color: null,
          id: 'done-2',
          name: 'Done',
          position: 1,
          status: 'done',
        },
        {
          color: null,
          id: 'todo-2',
          name: 'Todo',
          position: 0,
          status: 'not_started',
        },
      ],
    },
  ] satisfies WorkspaceTaskBoardWithLists[];

  it('prefers the current board and its configured default list', () => {
    expect(selectQuickCreateTarget(boards, 'board-2')).toMatchObject({
      board: { id: 'board-2' },
      list: { id: 'todo-2' },
    });
  });

  it('returns null when no board can accept a task', () => {
    expect(selectQuickCreateTarget([], null)).toBeNull();
  });
});
