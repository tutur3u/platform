import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { describe, expect, it } from 'vitest';
import {
  resolveInlineTaskTargetList,
  resolveInlineTaskTargetWorkspaceId,
} from './inline-task-target-list';

function createList(overrides: Partial<TaskList> = {}): TaskList {
  return {
    id: 'list-1',
    name: 'Todo',
    archived: false,
    deleted: false,
    created_at: '2026-01-01T00:00:00.000Z',
    board_id: 'board-1',
    creator_id: 'user-1',
    status: 'not_started',
    color: 'BLUE',
    position: 0,
    ...overrides,
  };
}

describe('resolveInlineTaskTargetList', () => {
  it('prefers the current selected list when it is writable', () => {
    const selectedList = createList({ id: 'selected-list', name: 'Selected' });
    const fallbackList = createList({ id: 'fallback-list', name: 'Fallback' });

    expect(
      resolveInlineTaskTargetList({
        availableLists: [fallbackList, selectedList],
        preferredListId: selectedList.id,
      })
    ).toBe(selectedList);
  });

  it('skips a deleted preferred list and falls back to the first writable list', () => {
    const deletedList = createList({ id: 'deleted-list', deleted: true });
    const writableList = createList({ id: 'writable-list' });

    expect(
      resolveInlineTaskTargetList({
        availableLists: [deletedList, writableList],
        preferredListId: deletedList.id,
      })
    ).toBe(writableList);
  });

  it('skips an external staging preferred list and falls back to the first writable list', () => {
    const stagingList = createList({
      id: 'personal-external-staging:board-1',
      is_external_staging: true,
    });
    const writableList = createList({ id: 'writable-list' });

    expect(
      resolveInlineTaskTargetList({
        availableLists: [stagingList, writableList],
        preferredListId: stagingList.id,
      })
    ).toBe(writableList);
  });

  it('returns null when no writable list exists', () => {
    expect(
      resolveInlineTaskTargetList({
        availableLists: [
          createList({ id: 'deleted-list', deleted: true }),
          createList({
            id: 'personal-external-staging:board-1',
            is_external_staging: true,
          }),
        ],
        preferredListId: 'deleted-list',
      })
    ).toBeNull();
  });
});

describe('resolveInlineTaskTargetWorkspaceId', () => {
  it('prefers the target board workspace over the current route workspace', () => {
    expect(
      resolveInlineTaskTargetWorkspaceId({
        boardWorkspaceId: 'source-ws',
        fallbackWorkspaceId: 'route-ws',
      })
    ).toBe('source-ws');
  });

  it('falls back to the current workspace when the board workspace is unavailable', () => {
    expect(
      resolveInlineTaskTargetWorkspaceId({
        boardWorkspaceId: null,
        fallbackWorkspaceId: 'route-ws',
      })
    ).toBe('route-ws');
  });
});
