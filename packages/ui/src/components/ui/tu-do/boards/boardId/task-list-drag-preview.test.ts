import type { Task } from '@tuturuuu/types/primitives/Task';
import { describe, expect, it } from 'vitest';
import { getTaskListDragPreviewSlot } from './task-list-drag-preview';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'Write release notes',
    list_id: 'list-1',
    created_at: '2026-05-24T00:00:00.000Z',
    sort_key: 1000,
    ...overrides,
  } as Task;
}

describe('getTaskListDragPreviewSlot', () => {
  it('uses a compact insertion line for same-list reordering', () => {
    expect(
      getTaskListDragPreviewSlot({
        columnId: 'list-1',
        preview: {
          height: 112,
          listId: 'list-1',
          overTaskId: 'task-2',
          position: 'before',
          task: makeTask({ id: 'task-1', list_id: 'list-1' }),
        },
        target: { kind: 'before-task', taskId: 'task-2' },
      })
    ).toEqual({
      kind: 'insertion-line',
      taskName: 'Write release notes',
    });
  });

  it('keeps a card-sized placeholder for cross-list moves', () => {
    expect(
      getTaskListDragPreviewSlot({
        columnId: 'list-2',
        preview: {
          height: 112,
          listId: 'list-2',
          overTaskId: 'task-2',
          position: 'before',
          task: makeTask({ id: 'task-1', list_id: 'list-1' }),
        },
        target: { kind: 'before-task', taskId: 'task-2' },
      })
    ).toEqual({
      height: 112,
      kind: 'card-placeholder',
      taskName: 'Write release notes',
    });
  });

  it('keeps an empty-list placeholder available for empty target columns', () => {
    expect(
      getTaskListDragPreviewSlot({
        columnId: 'list-2',
        preview: {
          height: 96,
          listId: 'list-2',
          overTaskId: null,
          position: 'empty',
          task: makeTask({ id: 'task-1', list_id: 'list-1' }),
        },
        target: { kind: 'empty-list' },
      })
    ).toEqual({
      height: 96,
      kind: 'card-placeholder',
      taskName: 'Write release notes',
    });
  });

  it('does not render a slot before the active drag source itself', () => {
    expect(
      getTaskListDragPreviewSlot({
        columnId: 'list-1',
        preview: {
          height: 112,
          listId: 'list-1',
          overTaskId: 'task-1',
          position: 'before',
          task: makeTask({ id: 'task-1', list_id: 'list-1' }),
        },
        target: { kind: 'before-task', taskId: 'task-1' },
      })
    ).toBeNull();
  });
});
