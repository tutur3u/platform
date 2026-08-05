/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateBoardAnywhereDialog } from '../create-board-anywhere-dialog';

const mocks = vi.hoisted(() => ({
  checkWorkspacePermission: vi.fn(),
  createWorkspaceTaskBoard: vi.fn(),
  listWorkspaces: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/settings', () => ({
  checkWorkspacePermission: (...args: unknown[]) =>
    mocks.checkWorkspacePermission(...args),
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  createWorkspaceTaskBoard: (...args: unknown[]) =>
    mocks.createWorkspaceTaskBoard(...args),
}));

vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  listWorkspaces: (...args: unknown[]) => mocks.listWorkspaces(...args),
}));

vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: ({
    ariaLabel,
    disabled,
    onChange,
    options,
    selected,
  }: {
    ariaLabel: string;
    disabled?: boolean;
    onChange: (value: string) => void;
    options: Array<{ label: string; value: string }>;
    selected: string;
  }) => (
    <select
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      value={selected}
    >
      <option value="">Choose</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('../../tasks-route-context', () => ({
  useTasksHref: () => (path: string) => `/tasks${path}`,
}));

describe('CreateBoardAnywhereDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listWorkspaces.mockResolvedValue([
      { id: 'ws-1', name: 'Current', personal: false },
      { id: 'ws-2', name: 'Studio', personal: false },
      { id: 'ws-guest', name: 'Guest only', personal: false },
    ]);
    mocks.checkWorkspacePermission.mockImplementation(
      async (workspaceId: string) => ({
        hasPermission: workspaceId !== 'ws-guest',
      })
    );
    mocks.createWorkspaceTaskBoard.mockResolvedValue({
      board: { id: 'board-new', name: 'Commission queue' },
    });
  });

  it('creates in another manageable workspace and opens the new board', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CreateBoardAnywhereDialog currentWorkspaceId="ws-1">
          <button type="button">Open creator</button>
        </CreateBoardAnywhereDialog>
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByText('Open creator'));

    const workspaceSelect = await screen.findByLabelText(
      'ws-task-boards.create_anywhere.workspace'
    );
    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: 'Studio' })
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('option', { name: 'Guest only' })
    ).not.toBeInTheDocument();

    fireEvent.change(workspaceSelect, { target: { value: 'ws-2' } });
    fireEvent.change(
      screen.getByLabelText('ws-task-boards.create_anywhere.name'),
      { target: { value: 'Commission queue' } }
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'ws-task-boards.create_anywhere.create',
      })
    );

    await waitFor(() => {
      expect(mocks.createWorkspaceTaskBoard).toHaveBeenCalledWith('ws-2', {
        name: 'Commission queue',
      });
    });
    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith('/ws-2/tasks/boards/board-new');
    });
  });
});
