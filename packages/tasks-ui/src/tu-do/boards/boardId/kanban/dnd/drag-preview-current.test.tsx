/** @vitest-environment jsdom */

import type { DragMoveEvent, DragStartEvent } from '@dnd-kit/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { useKanbanDnd } from './use-kanban-dnd';

vi.mock('../../../../shared/board-broadcast-context', () => ({
  useBoardBroadcast: () => null,
}));

it('exposes the latest target before render and clears it on cancel', () => {
  const queryClient = new QueryClient();
  const mutate = vi.fn();
  const columns = [
    { id: 'source', status: 'not_started' },
    { id: 'target', status: 'not_started' },
  ] as TaskList[];
  const task = {
    id: 'task-1',
    list_id: 'source',
    sort_key: 1_000_000,
  } as Task;
  const active = {
    id: task.id,
    data: { current: { type: 'Task', task } },
    rect: {
      current: {
        initial: { top: 100, height: 80 },
        translated: { top: 100, height: 80 },
      },
    },
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () =>
      useKanbanDnd({
        wsId: 'workspace',
        boardId: 'board',
        columns,
        tasks: [task],
        disableSort: true,
        selectedTasks: new Set(),
        isMultiSelectMode: false,
        clearSelection: vi.fn(),
        persistListPositions: vi.fn(),
        reorderTaskMutation: { mutate },
        taskHeightsRef: { current: new Map() },
        scrollContainerRef: { current: null },
      }),
    { wrapper }
  );

  act(() => {
    result.current.onDragStart({
      active,
      activatorEvent: new MouseEvent('mousedown', { clientX: 10 }),
    } as unknown as DragStartEvent);
  });
  const readLatestPreview = result.current.getDragPreviewPosition;

  act(() => {
    result.current.onDragMove({
      active,
      over: {
        id: 'column-surface-target',
        data: { current: { type: 'ColumnSurface', columnId: 'target' } },
      },
      delta: { x: 0, y: 0 },
      activatorEvent: new MouseEvent('mousemove', { clientX: 10 }),
    } as unknown as DragMoveEvent);

    expect(readLatestPreview()?.listId).toBe('target');
  });

  act(() => result.current.onDragCancel());
  expect(readLatestPreview()).toBeNull();
  expect(mutate).not.toHaveBeenCalled();
});
