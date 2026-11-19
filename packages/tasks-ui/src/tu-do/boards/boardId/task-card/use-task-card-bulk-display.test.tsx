/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { useTaskCardBulkDisplay } from './use-task-card-bulk-display';

const label = (id: string) => ({
  id,
  name: id,
  color: 'blue',
  created_at: '2026-11-19T00:00:00Z',
});

function task(id: string, labels: string[]): Task {
  return {
    id,
    name: id,
    list_id: 'list-1',
    display_number: 1,
    created_at: '2026-11-19T00:00:00Z',
    labels: labels.map(label),
  } as Task;
}

function setup(initial: Task[]) {
  const client = new QueryClient();
  client.setQueryData(['tasks', 'board-1'], initial);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe('useTaskCardBulkDisplay', () => {
  it('does not re-render a card outside bulk mode when other tasks change', () => {
    const tasks = [task('a', ['x']), task('b', ['y'])];
    const { client, wrapper } = setup(tasks);
    let renders = 0;
    const { result } = renderHook(
      () => {
        renders += 1;
        return useTaskCardBulkDisplay({ boardId: 'board-1', task: tasks[0]! });
      },
      { wrapper }
    );
    const before = renders;

    act(() => {
      client.setQueryData(
        ['tasks', 'board-1'],
        [tasks[0], task('b', ['z']), task('c', [])]
      );
    });

    expect(renders).toBe(before);
    expect(result.current.displayLabels.map((l) => l.id)).toEqual(['x']);
  });

  it('shows only the labels every selected task shares in bulk mode', () => {
    const tasks = [task('a', ['x', 'y']), task('b', ['y']), task('c', ['x'])];
    const { wrapper } = setup(tasks);
    const { result } = renderHook(
      () =>
        useTaskCardBulkDisplay({
          boardId: 'board-1',
          task: tasks[0]!,
          isMultiSelectMode: true,
          selectedTasks: new Set(['a', 'b']),
        }),
      { wrapper }
    );

    expect(result.current.displayLabels.map((l) => l.id)).toEqual(['y']);
  });
});
