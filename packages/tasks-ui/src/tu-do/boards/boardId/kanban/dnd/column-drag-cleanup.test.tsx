import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useKanbanDnd } from './use-kanban-dnd';

vi.mock('../../../../shared/board-broadcast-context', () => ({
  useBoardBroadcast: () => null,
}));
afterEach(() => vi.unstubAllGlobals());
it.each([false, true])(
  'stops scrolling on column drop before persistence completes (reorder=%s)',
  async (reorder) => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1)
    );
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const container = document.createElement('div');
    container.style.scrollSnapType = 'x mandatory';
    const columns = ['first', 'second'].map((id, position) => ({
      id,
      position,
      status: 'not_started',
    })) as TaskList[];
    let finishPersistence!: () => void;
    const persistListPositions = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishPersistence = resolve;
        })
    );
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useKanbanDnd({
          wsId: 'workspace',
          boardId: 'board',
          columns,
          tasks: [],
          disableSort: false,
          selectedTasks: new Set(),
          isMultiSelectMode: false,
          clearSelection: vi.fn(),
          persistListPositions,
          reorderTaskMutation: {},
          taskHeightsRef: { current: new Map() },
          scrollContainerRef: { current: container },
        }),
      { wrapper }
    );
    const active = {
      id: 'first',
      data: { current: { type: 'Column', column: columns[0] } },
      rect: { current: { initial: null, translated: null } },
    };
    act(() =>
      result.current.onDragStart({
        active,
        activatorEvent: new MouseEvent('mousedown', { clientX: 10 }),
      } as unknown as DragStartEvent)
    );
    expect(container.style.scrollSnapType).toBe('none');
    let drop!: Promise<void>;
    act(() => {
      drop = result.current.onDragEnd({
        active,
        over: {
          id: reorder ? 'second' : 'first',
          data: {
            current: { type: 'Column', column: columns[reorder ? 1 : 0] },
          },
        },
      } as unknown as DragEndEvent);
    });
    expect(container.style.scrollSnapType).toBe('x mandatory');
    expect(cancel).toHaveBeenCalled();
    await act(async () => {
      if (reorder) finishPersistence();
      await drop;
    });
    expect(result.current.activeColumn).toBeNull();
  }
);
