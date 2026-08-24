import { describe, expect, it } from 'vitest';
import { getSnapshotBeforeSelectedChange } from './snapshot-state';

describe('getSnapshotBeforeSelectedChange', () => {
  it('restores the source list for a selected move event', () => {
    expect(
      getSnapshotBeforeSelectedChange(
        { list_id: 'review', list_name: 'Review', name: 'Task' },
        {
          change_type: 'field_updated',
          field_name: 'list_id',
          old_value: 'backlog',
          metadata: { old_list_name: 'Backlog' },
        }
      )
    ).toEqual({ list_id: 'backlog', list_name: 'Backlog', name: 'Task' });
  });

  it('restores the previous value for other core field updates', () => {
    expect(
      getSnapshotBeforeSelectedChange(
        { name: 'New name', priority: 3 },
        {
          change_type: 'field_updated',
          field_name: 'priority',
          old_value: 1,
        }
      )
    ).toEqual({ name: 'New name', priority: 1 });
  });

  it('does not reinterpret relationship history entries', () => {
    const snapshot = { name: 'Task', priority: 2 };

    expect(
      getSnapshotBeforeSelectedChange(snapshot, {
        change_type: 'label_added',
        old_value: null,
      })
    ).toBe(snapshot);
  });
});
