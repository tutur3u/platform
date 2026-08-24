import { describe, expect, it } from 'vitest';
import {
  applyTaskHistorySnapshot,
  restoreTaskHistoryFields,
} from './task-revert-optimistic';

const task = {
  id: 'task-1',
  name: 'Current',
  description: 'Current description',
  list_id: 'current-list',
  display_number: 1,
  priority: 'high' as const,
  start_date: '2026-08-24T00:00:00.000Z',
  end_date: null,
  created_at: '2026-08-20T00:00:00.000Z',
  completed_at: '2026-08-24T01:00:00.000Z',
  estimation_points: 8,
  labels: [
    {
      id: 'label-current',
      name: 'Current label',
      color: 'blue',
      created_at: '2026-08-20T00:00:00.000Z',
    },
    {
      id: 'label-old',
      name: 'Old label',
      color: 'green',
      created_at: '2026-08-19T00:00:00.000Z',
    },
  ],
  assignees: [{ id: 'user-current', display_name: 'Current user' }],
  projects: [{ id: 'project-old', name: 'Old project', status: 'paused' }],
};

const snapshot = {
  id: 'task-1',
  name: 'Historical',
  description: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old' }] }],
  },
  priority: 'low' as const,
  start_date: null,
  end_date: '2026-08-21T00:00:00.000Z',
  estimation_points: 3,
  list_id: 'historical-list',
  completed: false,
  assignees: [
    { id: 'user-old', user_id: 'user-old', display_name: 'Historical user' },
  ],
  labels: [
    { id: 'label-old', name: 'Old label', color: 'green' },
    { id: 'label-new', name: 'New historical label', color: 'purple' },
  ],
  projects: [{ id: 'project-old', name: 'Old project' }],
};

describe('applyTaskHistorySnapshot', () => {
  it('applies every selected core and relationship field immediately', () => {
    const result = applyTaskHistorySnapshot({
      task,
      snapshot,
      fields: [
        'name',
        'description',
        'priority',
        'start_date',
        'end_date',
        'estimation_points',
        'list_id',
        'completed',
        'assignees',
        'labels',
        'projects',
      ],
      now: '2026-08-24T02:00:00.000Z',
    });

    expect(result).toMatchObject({
      name: 'Historical',
      priority: 'low',
      start_date: undefined,
      end_date: '2026-08-21T00:00:00.000Z',
      estimation_points: 3,
      list_id: 'historical-list',
      completed: false,
      completed_at: undefined,
      assignees: [{ id: 'user-old', display_name: 'Historical user' }],
      projects: [{ id: 'project-old', name: 'Old project', status: 'paused' }],
    });
    expect(result.description).toContain('"text":"Old"');
    expect(result.labels).toEqual([
      {
        id: 'label-old',
        name: 'Old label',
        color: 'green',
        created_at: '2026-08-19T00:00:00.000Z',
      },
      {
        id: 'label-new',
        name: 'New historical label',
        color: 'purple',
        created_at: '',
      },
    ]);
  });

  it('leaves unselected fields untouched', () => {
    const result = applyTaskHistorySnapshot({
      task,
      snapshot,
      fields: ['priority'],
      now: '2026-08-24T02:00:00.000Z',
    });

    expect(result).toEqual({ ...task, priority: 'low' });
  });

  it('optimistically marks a restored completed version with a timestamp', () => {
    const result = applyTaskHistorySnapshot({
      task: { ...task, completed_at: undefined },
      snapshot: { ...snapshot, completed: true },
      fields: ['completed'],
      now: '2026-08-24T02:00:00.000Z',
    });

    expect(result).toMatchObject({
      completed: true,
      completed_at: '2026-08-24T02:00:00.000Z',
    });
  });

  it('rolls back only fields owned by a failed restore', () => {
    const optimistic = applyTaskHistorySnapshot({
      task,
      snapshot,
      fields: ['name', 'labels'],
      now: '2026-08-24T02:00:00.000Z',
    });
    const concurrentlyUpdated = {
      ...optimistic,
      priority: 'critical' as const,
    };

    const result = restoreTaskHistoryFields({
      currentTask: concurrentlyUpdated,
      previousTask: task,
      fields: ['name', 'labels'],
    });

    expect(result.name).toBe('Current');
    expect(result.labels).toEqual(task.labels);
    expect(result.priority).toBe('critical');
  });
});
