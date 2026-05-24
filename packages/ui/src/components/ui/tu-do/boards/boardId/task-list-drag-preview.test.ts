import type { Task } from '@tuturuuu/types/primitives/Task';
import { describe, expect, it } from 'vitest';
import type { DragPreviewPosition } from './kanban/dnd/use-kanban-dnd';
import { getTaskDragPreviewSlotIndex } from './task-list';

function createPreview(
  overrides: Partial<DragPreviewPosition> = {}
): DragPreviewPosition {
  return {
    height: 112,
    insertionIndex: 1,
    listId: 'list-1',
    task: { id: 'task-1' } as Task,
    ...overrides,
  };
}

describe('getTaskDragPreviewSlotIndex', () => {
  it('returns the single insertion slot for the matching list', () => {
    expect(
      getTaskDragPreviewSlotIndex({
        columnId: 'list-1',
        preview: createPreview({ insertionIndex: 2 }),
        taskCount: 4,
      })
    ).toBe(2);
  });

  it('returns no slot for other lists', () => {
    expect(
      getTaskDragPreviewSlotIndex({
        columnId: 'list-2',
        preview: createPreview(),
        taskCount: 4,
      })
    ).toBeNull();
  });

  it('keeps empty and end-column slots within list bounds', () => {
    expect(
      getTaskDragPreviewSlotIndex({
        columnId: 'list-1',
        preview: createPreview({ insertionIndex: 0 }),
        taskCount: 0,
      })
    ).toBe(0);
    expect(
      getTaskDragPreviewSlotIndex({
        columnId: 'list-1',
        preview: createPreview({ insertionIndex: 99 }),
        taskCount: 3,
      })
    ).toBe(3);
  });
});
