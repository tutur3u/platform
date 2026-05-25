import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from '@tuturuuu/ui/sonner';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateListDialog } from '../create-list-dialog';

const createWorkspaceTaskListMock = vi.fn();

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  createWorkspaceTaskList: (...args: unknown[]) =>
    createWorkspaceTaskListMock(...args),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function renderCreateListDialog(
  props?: Partial<React.ComponentProps<typeof CreateListDialog>>
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CreateListDialog
        open
        onOpenChange={vi.fn()}
        boardId="board-1"
        wsId="ws-1"
        {...props}
      />
    </QueryClientProvider>
  );
}

describe('CreateListDialog', () => {
  beforeEach(() => {
    createWorkspaceTaskListMock.mockReset();
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.success).mockReset();
  });

  it('submits only once when create is triggered twice before the request settles', async () => {
    createWorkspaceTaskListMock.mockReturnValue(new Promise(() => {}));
    renderCreateListDialog();

    const nameInput = screen.getByLabelText('List Name');
    fireEvent.change(nameInput, { target: { value: 'Backlog' } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });
    fireEvent.keyDown(nameInput, { key: 'Enter' });

    await waitFor(() => {
      expect(createWorkspaceTaskListMock).toHaveBeenCalledTimes(1);
    });
  });

  it('allows retry after a failed create attempt', async () => {
    createWorkspaceTaskListMock
      .mockRejectedValueOnce(new Error('Failed once'))
      .mockResolvedValueOnce({
        list: {
          id: 'list-1',
          board_id: 'board-1',
          name: 'Backlog',
          status: 'not_started',
        },
      });
    renderCreateListDialog();

    const nameInput = screen.getByLabelText('List Name');
    const createButton = screen.getByRole('button', { name: 'Create List' });
    fireEvent.change(nameInput, { target: { value: 'Backlog' } });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed once');
    });

    fireEvent.click(createButton);

    await waitFor(() => {
      expect(createWorkspaceTaskListMock).toHaveBeenCalledTimes(2);
    });
  });

  it('shows the localized duplicate-name message when the API rejects a duplicate list name', async () => {
    createWorkspaceTaskListMock.mockRejectedValueOnce({
      code: 'TASK_LIST_NAME_EXISTS',
      message: 'Internal API request failed: 409',
    });
    renderCreateListDialog({
      translations: {
        listNameAlreadyExists: 'A list with this name already exists.',
      },
    });

    fireEvent.change(screen.getByLabelText('List Name'), {
      target: { value: 'Backlog' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create List' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'A list with this name already exists.'
      );
    });
  });
});
