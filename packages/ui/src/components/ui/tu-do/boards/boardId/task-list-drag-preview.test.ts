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
        tasks: [
          { id: 'task-a' },
          { id: 'task-b' },
          { id: 'task-c' },
          { id: 'task-d' },
        ],
      })
    ).toBe(2);
  });

  it('returns no slot for other lists', () => {
    expect(
      getTaskDragPreviewSlotIndex({
        columnId: 'list-2',
        preview: createPreview(),
        tasks: [
          { id: 'task-a' },
          { id: 'task-b' },
          { id: 'task-c' },
          { id: 'task-d' },
        ],
      })
    ).toBeNull();
  });

  it('keeps empty and end-column slots within list bounds', () => {
    expect(
      getTaskDragPreviewSlotIndex({
        columnId: 'list-1',
        preview: createPreview({ insertionIndex: 0 }),
        tasks: [],
      })
    ).toBe(0);
    expect(
      getTaskDragPreviewSlotIndex({
        columnId: 'list-1',
        preview: createPreview({ insertionIndex: 99 }),
        tasks: [{ id: 'task-a' }, { id: 'task-b' }, { id: 'task-c' }],
      })
    ).toBe(3);
  });

  it('converts same-list stationary indexes into full-list render slots after the dragged task', () => {
    expect(
      getTaskDragPreviewSlotIndex({
        columnId: 'list-1',
        preview: createPreview({
          insertionIndex: 2,
          task: { id: 'task-2' } as Task,
        }),
        tasks: [
          { id: 'task-1' },
          { id: 'task-2' },
          { id: 'task-3' },
          { id: 'task-4' },
        ],
      })
    ).toBe(3);
  });

  it('keeps same-list upward slots aligned before the dragged task', () => {
    expect(
      getTaskDragPreviewSlotIndex({
        columnId: 'list-1',
        preview: createPreview({
          insertionIndex: 1,
          task: { id: 'task-4' } as Task,
        }),
        tasks: [
          { id: 'task-1' },
          { id: 'task-2' },
          { id: 'task-3' },
          { id: 'task-4' },
        ],
      })
    ).toBe(1);
  });
});
