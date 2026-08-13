import type { CollisionDetection } from '@dnd-kit/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { closestCenterMock, pointerWithinMock } = vi.hoisted(() => ({
  closestCenterMock: vi.fn(),
  pointerWithinMock: vi.fn(),
}));

vi.mock('@dnd-kit/core', () => ({
  closestCenter: closestCenterMock,
  pointerWithin: pointerWithinMock,
}));

import { kanbanCollisionDetection } from './kanban-collision';

const taskDragArgs = {
  active: { data: { current: { type: 'Task' } } },
} as Parameters<CollisionDetection>[0];

describe('kanbanCollisionDetection', () => {
  beforeEach(() => {
    closestCenterMock.mockReset();
    pointerWithinMock.mockReset();
  });

  it('keeps the task under the pointer as the primary drag target', () => {
    const pointerCollision = [{ id: 'pointer-target' }];
    pointerWithinMock.mockReturnValue(pointerCollision);
    closestCenterMock.mockReturnValue([{ id: 'center-target' }]);

    expect(kanbanCollisionDetection(taskDragArgs)).toBe(pointerCollision);
  });

  it('falls back to the nearest center outside a droppable surface', () => {
    const centerCollision = [{ id: 'center-target' }];
    pointerWithinMock.mockReturnValue([]);
    closestCenterMock.mockReturnValue(centerCollision);

    expect(kanbanCollisionDetection(taskDragArgs)).toBe(centerCollision);
  });
});
