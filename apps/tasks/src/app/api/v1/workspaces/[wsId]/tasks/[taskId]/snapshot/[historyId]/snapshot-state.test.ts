import { describe, expect, it } from 'vitest';
import {
  getRelationshipsBeforeSelectedChange,
  getSnapshotBeforeSelectedChange,
} from './snapshot-state';

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

describe('getRelationshipsBeforeSelectedChange', () => {
  it.each([
    ['assignee_added', 'assignees', { user_id: 'user-2' }],
    ['label_added', 'labels', { id: 'label-2' }],
    ['project_linked', 'projects', { project_id: 'project-2' }],
  ] as const)('reverses %s events', (changeType, key, addedValue) => {
    const relationships = {
      assignees: [{ user_id: 'user-1' }, { user_id: 'user-2' }],
      labels: [{ id: 'label-1' }, { id: 'label-2' }],
      projects: [{ project_id: 'project-1' }, { project_id: 'project-2' }],
    };

    const result = getRelationshipsBeforeSelectedChange(relationships, {
      change_type: changeType,
      new_value: addedValue,
    });

    expect(result[key]).toHaveLength(1);
    expect(relationships[key]).toHaveLength(2);
  });

  it.each([
    ['assignee_removed', 'assignees', { user_id: 'user-2' }],
    ['label_removed', 'labels', { id: 'label-2' }],
    ['project_unlinked', 'projects', { project_id: 'project-2' }],
  ] as const)('reverses %s events', (changeType, key, removedValue) => {
    const result = getRelationshipsBeforeSelectedChange(
      {
        assignees: [{ user_id: 'user-1' }],
        labels: [{ id: 'label-1' }],
        projects: [{ project_id: 'project-1' }],
      },
      { change_type: changeType, old_value: removedValue }
    );

    expect(result[key]).toHaveLength(2);
    expect(result[key]?.[1]).toEqual(removedValue);
  });

  it('does not duplicate a relationship already present', () => {
    const relationships = { labels: [{ id: 'label-1' }] };

    const result = getRelationshipsBeforeSelectedChange(relationships, {
      change_type: 'label_removed',
      old_value: { id: 'label-1' },
    });

    expect(result).toEqual(relationships);
    expect(result.labels).toBe(relationships.labels);
  });
});
