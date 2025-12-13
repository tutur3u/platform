/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskBoardForm } from '../form';

const mutateAsync =
  vi.fn<
    (input: {
      name: string;
      templateId?: string;
      icon?: string | null;
    }) => Promise<{ id: string }>
  >();

const routerRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: routerRefresh,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@tuturuuu/utils/task-helper', () => ({
  useCreateBoardWithTemplate: () => ({
    mutateAsync,
    isPending: false,
  }),
}));

describe('TaskBoardForm', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    mutateAsync.mockReset();
    routerRefresh.mockReset();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  it('creates a board with default name when blank', async () => {
    mutateAsync.mockResolvedValue({ id: 'board-1' });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <QueryClientProvider client={queryClient}>
        <TaskBoardForm wsId="ws-1" onFinish={vi.fn()} />
      </QueryClientProvider>
    );

    // Submit without typing a name
    fireEvent.click(screen.getByRole('button', { name: 'common.create' }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        name: 'Untitled Board',
        icon: null,
      });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['boards', 'ws-1'],
      });
    });

    expect(routerRefresh).toHaveBeenCalled();
  });

  it('trims the provided name before creating', async () => {
    mutateAsync.mockResolvedValue({ id: 'board-2' });

    render(
      <QueryClientProvider client={queryClient}>
        <TaskBoardForm wsId="ws-1" onFinish={vi.fn()} />
      </QueryClientProvider>
    );

    fireEvent.change(screen.getByLabelText('ws-task-boards.name'), {
      target: { value: '  My Board  ' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'common.create' }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        name: 'My Board',
        icon: null,
      });
    });
  });
});
