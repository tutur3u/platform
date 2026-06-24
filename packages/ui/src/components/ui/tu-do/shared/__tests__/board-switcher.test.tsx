import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardSwitcher } from '../board-switcher';

const {
  createWorkspaceTaskBoardMock,
  isTaskRememberLastBoardEnabledMock,
  listWorkspaceTaskBoardsMock,
  pushMock,
  rememberLastBoardConfig,
  updateUserWorkspaceConfigMock,
  useUserWorkspaceConfigMock,
} = vi.hoisted(() => ({
  createWorkspaceTaskBoardMock: vi.fn(),
  isTaskRememberLastBoardEnabledMock: vi.fn(
    (value: string | null | undefined) => value !== 'false'
  ),
  listWorkspaceTaskBoardsMock: vi.fn(),
  pushMock: vi.fn(),
  rememberLastBoardConfig: {
    value: 'true' as string | null | undefined,
  },
  updateUserWorkspaceConfigMock: vi.fn(),
  useUserWorkspaceConfigMock: vi.fn(),
}));

let comboboxProps:
  | {
      createText?: string;
      creatingText?: string;
      onChange: (value: string) => void;
      onCreate?: (value: string) => Promise<{ label: string; value: string }>;
      options: Array<{ icon?: unknown; label: string; value: string }>;
      searchPlaceholder?: string;
      selected?: string;
      showSelectedIcon?: boolean;
    }
  | undefined;

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  createWorkspaceTaskBoard: (
    ...args: Parameters<typeof createWorkspaceTaskBoardMock>
  ) => createWorkspaceTaskBoardMock(...args),
  listWorkspaceTaskBoards: (
    ...args: Parameters<typeof listWorkspaceTaskBoardsMock>
  ) => listWorkspaceTaskBoardsMock(...args),
}));

vi.mock('@tuturuuu/internal-api/users', () => ({
  isTaskRememberLastBoardEnabled: (value: string | null | undefined): boolean =>
    isTaskRememberLastBoardEnabledMock(value),
  TASK_DEFAULT_BOARD_ID_CONFIG_ID: 'TASK_DEFAULT_BOARD_ID',
  TASK_REMEMBER_LAST_BOARD_CONFIG_ID: 'TASK_REMEMBER_LAST_BOARD',
}));

vi.mock('../../../../../hooks/use-user-workspace-config', () => ({
  useUpdateUserWorkspaceConfig: () => ({
    isPending: false,
    mutate: updateUserWorkspaceConfigMock,
  }),
  useUserWorkspaceConfig: (...args: unknown[]) => {
    useUserWorkspaceConfigMock(...args);
    return {
      data: rememberLastBoardConfig.value,
      isLoading: false,
    };
  },
}));

vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: (props: any) => {
    comboboxProps = props;
    return (
      <div>
        <button
          type="button"
          data-testid="board-combobox"
          onClick={() => props.onChange('board-2')}
        >
          {props.label}
        </button>
        <button
          type="button"
          data-testid="create-board"
          onClick={async () => {
            const result = await props.onCreate?.('Launch Board');
            const boardId = typeof result === 'string' ? result : result?.value;
            if (boardId) props.onChange(boardId);
          }}
        >
          Create board
        </button>
      </div>
    );
  },
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('../tasks-route-context', () => ({
  useTasksHref: () => (path: string) => `/tasks${path}`,
}));

function renderBoardSwitcher() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BoardSwitcher
        board={{
          id: 'board-1',
          name: 'Tasks',
          ticket_prefix: 'T',
          ws_id: 'ws-1',
        }}
        translations={{
          activeBoards: 'Active boards',
          archivedBoards: 'Archived boards',
          deletedBoards: 'Deleted boards',
          createBoard: 'Create Board',
          creatingBoard: 'Creating',
          searchBoards: 'Search boards...',
          tasks: 'Tasks',
        }}
      />
    </QueryClientProvider>
  );
}

describe('BoardSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    comboboxProps = undefined;
    rememberLastBoardConfig.value = 'true';
    listWorkspaceTaskBoardsMock.mockResolvedValue({
      boards: [
        {
          archived_at: null,
          created_at: '2026-06-01T00:00:00.000Z',
          deleted_at: null,
          icon: null,
          id: 'board-2',
          name: 'Roadmap',
        },
      ],
    });
  });

  it('uses the shared combobox and navigates when a board is selected', async () => {
    renderBoardSwitcher();

    expect(screen.getByTestId('board-combobox')).toBeInTheDocument();

    await waitFor(() => {
      expect(comboboxProps?.options).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Roadmap',
            value: 'board-2',
          }),
        ])
      );
    });

    expect(comboboxProps).toMatchObject({
      createText: 'Create Board',
      creatingText: 'Creating',
      searchPlaceholder: 'Search boards...',
      selected: 'board-1',
    });
    expect(comboboxProps?.showSelectedIcon).toBeUndefined();
    expect(comboboxProps?.options.some((option) => option.icon)).toBe(true);

    fireEvent.click(screen.getByTestId('board-combobox'));

    expect(pushMock).toHaveBeenCalledWith('/ws-1/tasks/boards/board-2');
    expect(useUserWorkspaceConfigMock).toHaveBeenCalledWith(
      'ws-1',
      'TASK_REMEMBER_LAST_BOARD',
      'true'
    );
    expect(isTaskRememberLastBoardEnabledMock).toHaveBeenCalledWith('true');
    expect(updateUserWorkspaceConfigMock).toHaveBeenCalledWith({
      configId: 'TASK_DEFAULT_BOARD_ID',
      value: 'board-2',
      workspaceId: 'ws-1',
    });
  });

  it('navigates without updating the default board when board memory is disabled', async () => {
    rememberLastBoardConfig.value = 'false';
    renderBoardSwitcher();

    await waitFor(() => {
      expect(comboboxProps?.options.length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByTestId('board-combobox'));

    expect(pushMock).toHaveBeenCalledWith('/ws-1/tasks/boards/board-2');
    expect(updateUserWorkspaceConfigMock).not.toHaveBeenCalled();
  });

  it('creates a new board from the picker and opens it', async () => {
    createWorkspaceTaskBoardMock.mockResolvedValue({
      board: {
        archived_at: null,
        created_at: '2026-06-24T00:00:00.000Z',
        deleted_at: null,
        icon: null,
        id: 'board-3',
        name: 'Launch Board',
      },
    });

    renderBoardSwitcher();

    fireEvent.click(screen.getByTestId('create-board'));

    await waitFor(() => {
      expect(createWorkspaceTaskBoardMock).toHaveBeenCalledWith('ws-1', {
        name: 'Launch Board',
      });
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/ws-1/tasks/boards/board-3');
    });
    expect(updateUserWorkspaceConfigMock).toHaveBeenCalledWith({
      configId: 'TASK_DEFAULT_BOARD_ID',
      value: 'board-3',
      workspaceId: 'ws-1',
    });
  });
});
