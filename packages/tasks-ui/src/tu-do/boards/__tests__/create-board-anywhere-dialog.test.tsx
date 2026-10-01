/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateBoardAnywhereDialog } from '../create-board-anywhere-dialog';

const mocks = vi.hoisted(() => ({
  checkWorkspacePermission: vi.fn(),
  createWorkspaceTaskBoard: vi.fn(),
  hiddenIds: [] as string[],
  hidden: vi.fn(),
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
    emptyText,
    placeholder,
    onChange,
    options,
    selected,
  }: {
    ariaLabel: string;
    disabled?: boolean;
    emptyText?: string;
    placeholder?: string;
    onChange: (value: string) => void;
    options: Array<{ label: string; value: string }>;
    selected: string;
  }) => (
    <select
      aria-label={ariaLabel}
      data-empty-text={emptyText}
      data-placeholder={placeholder}
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

vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserHiddenWorkspaces: mocks.hidden,
  updateCurrentUserHiddenWorkspace: vi.fn(),
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
    mocks.hiddenIds = [];
    mocks.hidden.mockImplementation(async () => ({
      hiddenWorkspaceIds: mocks.hiddenIds,
    }));
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
        <WorkspaceVisibilityProvider actorId="synthetic-actor">
          <CreateBoardAnywhereDialog currentWorkspaceId="ws-1">
            <button type="button">Open creator</button>
          </CreateBoardAnywhereDialog>
        </WorkspaceVisibilityProvider>
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
  it('excludes a manageable Hidden workspace before permission checks and creation choices', async () => {
    mocks.hiddenIds = ['ws-2'];
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceVisibilityProvider actorId="synthetic-actor">
          <CreateBoardAnywhereDialog currentWorkspaceId="ws-1">
            <button type="button">Open creator</button>
          </CreateBoardAnywhereDialog>
        </WorkspaceVisibilityProvider>
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByText('Open creator'));
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'Current' })
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByRole('option', { name: 'Studio' })
    ).not.toBeInTheDocument();
    expect(mocks.checkWorkspacePermission).not.toHaveBeenCalledWith(
      'ws-2',
      'manage_projects'
    );
  });
});

function openFixture() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId="synthetic-actor">
        <CreateBoardAnywhereDialog currentWorkspaceId="ws-1">
          <button type="button">Open creator</button>
        </CreateBoardAnywhereDialog>
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByText('Open creator'));
  return client;
}
it('uses current names while permission IDs remain cached', async () => {
  mocks.hidden.mockResolvedValue({ hiddenWorkspaceIds: [] });
  mocks.listWorkspaces.mockResolvedValue([{ id: 'ws-1', name: 'Before' }]);
  mocks.checkWorkspacePermission.mockResolvedValue({ hasPermission: true });
  const client = openFixture();
  await screen.findByRole('option', { name: 'Before' });
  const permissionCalls = mocks.checkWorkspacePermission.mock.calls.length;
  mocks.listWorkspaces.mockResolvedValue([{ id: 'ws-1', name: 'Renamed' }]);
  await client.invalidateQueries({
    queryKey: ['workspace-ui-list', 'synthetic-actor', 200],
    exact: true,
  });
  await screen.findByRole('option', { name: 'Renamed' });
  expect(screen.queryByRole('option', { name: 'Before' })).toBeNull();
  expect(mocks.checkWorkspacePermission).toHaveBeenCalledTimes(permissionCalls);
});
it('shows a settled privacy error without presenting an empty membership list', async () => {
  mocks.hidden.mockRejectedValue(new Error('offline'));
  mocks.listWorkspaces.mockResolvedValue([{ id: 'ws-1', name: 'Current' }]);
  const client = openFixture();
  await waitFor(() =>
    expect(
      client.getQueryState(['workspace-hidden', 'synthetic-actor'])?.status
    ).toBe('error')
  );
  const select = screen.getByLabelText(
    'ws-task-boards.create_anywhere.workspace'
  );
  await waitFor(() =>
    expect(select).toHaveAttribute(
      'data-placeholder',
      'ws-task-boards.create_anywhere.workspace_placeholder'
    )
  );
  expect(select).toHaveAttribute(
    'data-empty-text',
    'ws-task-boards.create_anywhere.workspace_error'
  );
  expect(screen.queryByRole('option', { name: 'Current' })).toBeNull();
});
