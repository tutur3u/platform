import { describe, expect, it } from 'vitest';
import { shouldBlockManualTaskOrdering } from './manual-task-ordering';

const task = { id: 'task-1', list_id: 'list-1' };

describe('shouldBlockManualTaskOrdering', () => {
  it('allows every drop when criteria sorting is inactive', () => {
    expect(
      shouldBlockManualTaskOrdering({
        activeData: { task, type: 'Task' },
        criteriaSortingActive: false,
        overData: { task: { id: 'task-2', list_id: 'list-1' }, type: 'Task' },
        overId: 'task-2',
      })
    ).toBe(false);
  });

  it.each([
    {
      label: 'another task in the source list',
      overData: { task: { id: 'task-2', list_id: 'list-1' }, type: 'Task' },
      overId: 'task-2',
    },
    {
      label: 'the source column',
      overData: { type: 'Column' },
      overId: 'list-1',
    },
    {
      label: 'the source column surface',
      overData: { columnId: 'list-1', type: 'ColumnSurface' },
      overId: 'surface-1',
    },
  ])('blocks a manual drop over $label', ({ overData, overId }) => {
    expect(
      shouldBlockManualTaskOrdering({
        activeData: { task, type: 'Task' },
        criteriaSortingActive: true,
        overData,
        overId,
      })
    ).toBe(true);
  });

  it('uses the latest preview destination before stale collision data', () => {
    expect(
      shouldBlockManualTaskOrdering({
        activeData: { task, type: 'Task' },
        criteriaSortingActive: true,
        overData: { task: { id: 'task-2', list_id: 'list-2' }, type: 'Task' },
        overId: 'task-2',
        preview: { listId: 'list-1', taskId: 'task-1' },
      })
    ).toBe(true);
  });

  it.each([
    {
      label: 'a task in another list',
      overData: { task: { id: 'task-2', list_id: 'list-2' }, type: 'Task' },
      overId: 'task-2',
    },
    {
      label: 'another column',
      overData: { type: 'Column' },
      overId: 'list-2',
    },
    {
      label: 'another column surface',
      overData: { columnId: 'list-2', type: 'ColumnSurface' },
      overId: 'surface-2',
    },
  ])('allows moving a task to $label', ({ overData, overId }) => {
    expect(
      shouldBlockManualTaskOrdering({
        activeData: { task, type: 'Task' },
        criteriaSortingActive: true,
        overData,
        overId,
      })
    ).toBe(false);
  });

  it('does not interfere with list dragging or invalid drops', () => {
    expect(
      shouldBlockManualTaskOrdering({
        activeData: { type: 'Column' },
        criteriaSortingActive: true,
        overData: { type: 'Column' },
        overId: 'list-1',
      })
    ).toBe(false);
    expect(
      shouldBlockManualTaskOrdering({
        activeData: { task, type: 'Task' },
        criteriaSortingActive: true,
        overData: undefined,
        overId: undefined,
      })
    ).toBe(false);
  });
});
