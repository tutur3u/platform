import { describe, expect, it } from 'vitest';
import { getTaskMoveListNames } from './task-move-history-details';

describe('task activity move context', () => {
  it('uses the source and destination list names recorded in history metadata', () => {
    expect(
      getTaskMoveListNames({
        metadata: {
          old_list_name: 'Review',
          new_list_name: 'Done',
        },
        old_value: 'old-list-id',
        new_value: 'new-list-id',
      })
    ).toEqual({ oldListName: 'Review', newListName: 'Done' });
  });

  it('supports enriched list values when history comes from another context', () => {
    expect(
      getTaskMoveListNames({
        metadata: {},
        old_value: { id: 'old-list-id', name: 'Backlog' },
        new_value: { id: 'new-list-id', name: 'In progress' },
      })
    ).toEqual({ oldListName: 'Backlog', newListName: 'In progress' });
  });
});
