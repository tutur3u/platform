import { describe, expect, it } from 'vitest';
import { getSeededPendingTaskRelationships } from './pending-relationship';

describe('getSeededPendingTaskRelationships', () => {
  it('seeds the parent tab for legacy subtask creation', () => {
    expect(
      getSeededPendingTaskRelationships({
        parentTaskId: 'task-parent',
        parentTaskName: 'Parent task',
      })
    ).toMatchObject({
      parentTask: {
        id: 'task-parent',
        name: 'Parent task',
      },
      childTasks: [],
      initialActiveTab: 'parent',
    });
  });

  it('seeds the subtasks tab when creating a new parent task', () => {
    expect(
      getSeededPendingTaskRelationships({
        pendingRelationship: {
          type: 'parent',
          relatedTaskId: 'task-child',
          relatedTaskName: 'Child task',
        },
      })
    ).toMatchObject({
      parentTask: null,
      childTasks: [{ id: 'task-child', name: 'Child task' }],
      initialActiveTab: 'subtasks',
    });
  });

  it('seeds the dependencies tab and blocked-by subtab for blocking flows', () => {
    expect(
      getSeededPendingTaskRelationships({
        pendingRelationship: {
          type: 'blocking',
          relatedTaskId: 'task-blocker',
          relatedTaskName: 'Blocking task',
        },
      })
    ).toMatchObject({
      blockedByTasks: [{ id: 'task-blocker', name: 'Blocking task' }],
      initialActiveTab: 'dependencies',
      initialDependencySubTab: 'blocked-by',
    });
  });
});
