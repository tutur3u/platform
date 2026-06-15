import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardDefaultListSettings } from './board-default-list-settings';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  HttpError: class HttpError extends Error {
    constructor(
      public readonly status: number,
      message: string
    ) {
      super(message);
      this.name = 'HttpError';
    }
  },
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: (...args: Parameters<typeof mocks.apiFetch>) =>
    mocks.apiFetch(...args),
  HttpError: mocks.HttpError,
}));

vi.mock('@tuturuuu/ui/custom/settings-item-tab', () => ({
  SettingItemTab: ({
    children,
    title,
  }: {
    children: ReactNode;
    title: ReactNode;
  }) => (
    <div>
      <div>{title}</div>
      {children}
    </div>
  ),
}));

vi.mock('@tuturuuu/ui/select', () => ({
  Select: ({
    children,
    disabled,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onValueChange: (value: string) => void;
    value: string;
  }) => (
    <select
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
      value={value}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>
      {typeof children === 'string' ? children : value}
    </option>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => children,
  SelectValue: () => null,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <BoardDefaultListSettings wsId="ws-1" />
    </QueryClientProvider>
  );
}

const boardsResponse = {
  boards: [
    {
      id: 'board-1',
      name: 'Roadmap',
      default_list_id: null,
      task_lists: [
        { id: 'list-1', name: 'To Do', deleted: false },
        { id: 'list-2', name: 'In Progress', deleted: false },
      ],
    },
  ],
};

describe('BoardDefaultListSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists boards and persists a chosen default list via PUT', async () => {
    mocks.apiFetch.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return Promise.resolve({});
      return Promise.resolve(boardsResponse);
    });

    renderSettings();

    await waitFor(() =>
      expect(screen.getByText('Roadmap')).toBeInTheDocument()
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'list-2' } });

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        '/api/v1/workspaces/ws-1/task-boards/board-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ default_list_id: 'list-2' }),
        })
      )
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'board_default_list_update_success'
    );
  });

  it('clears the default list when selecting the none option', async () => {
    mocks.apiFetch.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return Promise.resolve({});
      return Promise.resolve({
        boards: [{ ...boardsResponse.boards[0], default_list_id: 'list-1' }],
      });
    });

    renderSettings();

    await waitFor(() =>
      expect(screen.getByText('Roadmap')).toBeInTheDocument()
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '__none__' } });

    await waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        '/api/v1/workspaces/ws-1/task-boards/board-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ default_list_id: null }),
        })
      )
    );
  });

  it('shows the server error when a default list update is not persisted', async () => {
    mocks.apiFetch.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.reject(
          new mocks.HttpError(
            503,
            'Default task list settings are not available until the database migration is applied'
          )
        );
      }

      return Promise.resolve(boardsResponse);
    });

    renderSettings();

    await waitFor(() =>
      expect(screen.getByText('Roadmap')).toBeInTheDocument()
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'list-2' } });

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Default task list settings are not available until the database migration is applied'
      )
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});
