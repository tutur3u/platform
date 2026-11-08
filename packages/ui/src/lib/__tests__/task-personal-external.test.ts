import type { Task } from '@tuturuuu/types/primitives/Task';
import { getPersonalExternalStagingListId } from '@tuturuuu/utils/task-helper/personal-external-staging';
import { describe, expect, it } from 'vitest';
import { isPersonalExternalOverlayTask } from '../task-personal-external';

function task(fields: Partial<Task>): Task {
  return { id: 'task-1', name: 'Task', list_id: 'list-1', ...fields } as Task;
}

describe('isPersonalExternalOverlayTask', () => {
  it('returns false for missing tasks', () => {
    expect(isPersonalExternalOverlayTask(undefined)).toBe(false);
    expect(isPersonalExternalOverlayTask(null)).toBe(false);
  });

  it('trusts an explicit is_personal_external flag', () => {
    expect(
      isPersonalExternalOverlayTask(task({ is_personal_external: true }))
    ).toBe(true);
    expect(
      isPersonalExternalOverlayTask(
        task({
          is_personal_external: false,
          list_id: getPersonalExternalStagingListId('board-1'),
          personal_board_id: 'board-1',
          source_board_id: 'board-2',
        })
      )
    ).toBe(false);
  });

  it('treats tasks in a personal external staging list as overlays', () => {
    expect(
      isPersonalExternalOverlayTask(
        task({ list_id: getPersonalExternalStagingListId('board-1') })
      )
    ).toBe(true);
  });

  it('ignores a bare staging prefix with no board id', () => {
    expect(
      isPersonalExternalOverlayTask(
        task({ list_id: getPersonalExternalStagingListId('') })
      )
    ).toBe(false);
  });

  it('returns false when there is no personal board or list', () => {
    expect(
      isPersonalExternalOverlayTask(
        task({
          personal_board_id: '',
          personal_list_id: null,
          source_board_id: 'board-2',
        })
      )
    ).toBe(false);
  });

  it('returns true when the source board differs from the personal board', () => {
    expect(
      isPersonalExternalOverlayTask(
        task({ personal_board_id: 'board-1', source_board_id: 'board-2' })
      )
    ).toBe(true);
  });

  it('returns false when the source board is the personal board', () => {
    expect(
      isPersonalExternalOverlayTask(
        task({ personal_board_id: 'board-1', source_board_id: 'board-1' })
      )
    ).toBe(false);
  });

  it('returns true for a workspace source list that differs from the personal list', () => {
    expect(
      isPersonalExternalOverlayTask(
        task({
          personal_list_id: 'personal-list',
          source_workspace_id: 'ws-1',
          source_list_id: 'source-list',
        })
      )
    ).toBe(true);
  });

  it('returns false when the source list is the personal list', () => {
    expect(
      isPersonalExternalOverlayTask(
        task({
          personal_list_id: 'personal-list',
          source_workspace_id: 'ws-1',
          source_list_id: 'personal-list',
        })
      )
    ).toBe(false);
  });

  it('requires a source workspace and list for the list comparison', () => {
    expect(
      isPersonalExternalOverlayTask(
        task({ personal_list_id: 'personal-list', source_list_id: 'other' })
      )
    ).toBe(false);
    expect(
      isPersonalExternalOverlayTask(
        task({ personal_list_id: 'personal-list', source_workspace_id: 'ws-1' })
      )
    ).toBe(false);
  });

  it('does not use the list comparison when a source board is present', () => {
    expect(
      isPersonalExternalOverlayTask(
        task({
          personal_board_id: 'board-1',
          personal_list_id: 'personal-list',
          source_board_id: 'board-1',
          source_workspace_id: 'ws-1',
          source_list_id: 'source-list',
        })
      )
    ).toBe(false);
  });

  it('needs a personal list id for the list comparison', () => {
    expect(
      isPersonalExternalOverlayTask(
        task({
          personal_board_id: 'board-1',
          source_workspace_id: 'ws-1',
          source_list_id: 'source-list',
        })
      )
    ).toBe(false);
  });
});
