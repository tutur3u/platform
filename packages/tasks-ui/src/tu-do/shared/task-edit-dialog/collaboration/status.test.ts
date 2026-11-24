import { describe, expect, it } from 'vitest';
import {
  getListStatusKey,
  groupListsByStatus,
  resolveStatusListId,
} from './status';

type TestList = Parameters<typeof groupListsByStatus>[0][number];

const list = (
  id: string,
  name: string,
  status: TestList['status'],
  position: number,
  extra: Partial<TestList> = {}
): TestList => ({ id, name, status, position, ...extra });

const board: TestList[] = [
  list('queued', 'Queued', 'not_started', 2),
  list('backlog', 'Backlog', 'not_started', 1),
  list('waiting', 'Waiting on USER', 'not_started', 3),
  list('knowledge', 'Fleet Knowledge', 'not_started', 4),
  list('doing-b', 'Doing B', 'active', 6),
  list('doing-a', 'Doing A', 'active', 5),
  list('review', 'Review', 'review', 7),
  list('done-late', 'Shipped', 'done', 9),
  list('done-early', 'Done', 'done', 8),
  list('closed-late', 'Wontfix', 'closed', 11),
  list('closed-early', 'Cancelled', 'closed', 10),
];

describe('status mapping', () => {
  it('maps lists to the six statuses', () => {
    expect(getListStatusKey(board[1]!)).toBe('backlog');
    expect(getListStatusKey(board[0]!)).toBe('todo');
    expect(getListStatusKey(board[4]!)).toBe('in-progress');
    expect(getListStatusKey(board[6]!)).toBe('review');
    expect(getListStatusKey(board[8]!)).toBe('done');
    expect(getListStatusKey(board[10]!)).toBe('cancelled');
    expect(getListStatusKey(list('docs', 'Docs', 'documents', 0))).toBeNull();
  });

  it('resolves each status to a board list by the contract rules', () => {
    expect(resolveStatusListId('backlog', board)).toBe('backlog');
    expect(resolveStatusListId('todo', board)).toBe('queued');
    expect(resolveStatusListId('in-progress', board)).toBe('doing-a');
    expect(resolveStatusListId('review', board)).toBe('review');
  });

  it('falls back to the first not_started list when none is named backlog', () => {
    const lists = board.filter((l) => l.id !== 'backlog');
    expect(resolveStatusListId('backlog', lists)).toBe('queued');
  });

  it('uses the lowest-position done and closed list when no default is set', () => {
    expect(resolveStatusListId('done', board)).toBe('done-early');
    expect(resolveStatusListId('cancelled', board)).toBe('closed-early');
  });

  it('prefers the board defaults for done and cancelled', () => {
    const defaults = {
      defaultDoneListId: 'done-late',
      defaultClosedListId: 'closed-late',
    };
    expect(resolveStatusListId('done', board, defaults)).toBe('done-late');
    expect(resolveStatusListId('cancelled', board, defaults)).toBe(
      'closed-late'
    );
  });

  it('ignores a default that is not an active list of the board', () => {
    expect(
      resolveStatusListId('done', board, { defaultDoneListId: 'missing' })
    ).toBe('done-early');
  });

  it('ignores a default whose list has a different status', () => {
    expect(
      resolveStatusListId('done', board, { defaultDoneListId: 'closed-late' })
    ).toBe('done-early');
    expect(
      resolveStatusListId('cancelled', board, {
        defaultClosedListId: 'done-late',
      })
    ).toBe('closed-early');
  });

  it('skips deleted and archived lists and returns null for a missing status', () => {
    const lists = [
      list('gone', 'Review', 'review', 1, { deleted: true }),
      list('old', 'Review 2', 'review', 2, { archived: true }),
    ];
    expect(resolveStatusListId('review', lists)).toBeNull();
    expect(resolveStatusListId('todo', [])).toBeNull();
  });
});

describe('groupListsByStatus', () => {
  it('keeps every real list, grouped by status in display order', () => {
    const groups = groupListsByStatus(board);

    expect(groups.map((g) => g.key)).toEqual([
      'backlog',
      'todo',
      'in-progress',
      'review',
      'done',
      'cancelled',
    ]);
    expect(groups[1]!.lists.map((l) => l.name)).toEqual([
      'Queued',
      'Waiting on USER',
      'Fleet Knowledge',
    ]);
    expect(groups[2]!.lists.map((l) => l.id)).toEqual(['doing-a', 'doing-b']);
  });

  it('omits statuses the board has no list for and non-status lists', () => {
    const groups = groupListsByStatus([
      list('a', 'Docs', 'documents', 0),
      list('b', 'Doing', 'active', 1),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe('in-progress');
  });
});
