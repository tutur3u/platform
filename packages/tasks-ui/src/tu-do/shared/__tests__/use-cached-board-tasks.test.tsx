/** @vitest-environment jsdom */
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { useCachedBoardTasks } from '../use-cached-board-tasks';

it('keeps the real board fetcher when a card subscribes and a refetch runs', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tasks = [
    { id: 'native', list_id: 'next-week' },
    { id: 'external', list_id: 'next-week', is_personal_external: true },
  ] as Task[];
  const fetchBoard = vi.fn().mockResolvedValue(tasks);
  function Card() {
    const [hovered, setHovered] = useState(false);
    const { data } = useCachedBoardTasks('board', (value) => value.length);
    return (
      <button
        type="button"
        data-testid="count"
        onClick={() => setHovered(!hovered)}
      >
        {data}
      </button>
    );
  }
  function Board() {
    useQuery({
      queryKey: ['tasks', 'board'],
      queryFn: fetchBoard,
      initialData: tasks,
      staleTime: Infinity,
    });
    return <Card />;
  }
  render(
    <QueryClientProvider client={queryClient}>
      <Board />
    </QueryClientProvider>
  );
  expect(screen.getByTestId('count').textContent).toBe('2');
  fireEvent.click(screen.getByTestId('count'));
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: ['tasks', 'board'] });
  });
  await waitFor(() => expect(fetchBoard).toHaveBeenCalled());
  expect(queryClient.getQueryData(['tasks', 'board'])).toEqual(tasks);
  expect(screen.getByTestId('count').textContent).toBe('2');
});
