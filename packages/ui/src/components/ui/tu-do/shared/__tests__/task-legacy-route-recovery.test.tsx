import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskLegacyRouteRecovery } from '../task-legacy-route-recovery';

const mockReplace = vi.fn();
const mockGetWorkspaceTask = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  getWorkspaceTask: (...args: unknown[]) => mockGetWorkspaceTask(...args),
}));

function renderWithQueryClient(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('TaskLegacyRouteRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/personal/tasks/task-1');
  });

  it('redirects the legacy task route to the canonical board task URL', async () => {
    mockGetWorkspaceTask.mockResolvedValue({
      task: {
        id: 'task-1',
        board_id: 'board-1',
      },
    });

    renderWithQueryClient(
      <TaskLegacyRouteRecovery
        routePrefix="/tasks"
        taskId="task-1"
        workspaceId="personal"
      />
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        '/personal/tasks/boards/board-1?task=task-1'
      );
    });
  });

  it('shows a recoverable error state instead of a 404 when resolution fails', async () => {
    mockGetWorkspaceTask.mockRejectedValue(new Error('boom'));

    renderWithQueryClient(
      <TaskLegacyRouteRecovery
        routePrefix="/tasks"
        taskId="task-1"
        workspaceId="personal"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('error_loading_data')).toBeInTheDocument();
    });

    expect(screen.getByText('Task ID: task-1')).toBeInTheDocument();
  });
});
