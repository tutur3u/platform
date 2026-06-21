import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardSwitcher } from '../board-switcher';

const listWorkspaceTaskBoardsMock = vi.fn();
const pushMock = vi.fn();
let comboboxProps:
  | {
      onChange: (value: string) => void;
      options: Array<{ icon?: unknown; label: string; value: string }>;
      searchPlaceholder?: string;
      selected?: string;
      showSelectedIcon?: boolean;
    }
  | undefined;

vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaceTaskBoards: (
    ...args: Parameters<typeof listWorkspaceTaskBoardsMock>
  ) => listWorkspaceTaskBoardsMock(...args),
}));

vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: (props: any) => {
    comboboxProps = props;
    return (
      <button
        type="button"
        data-testid="board-combobox"
        onClick={() => props.onChange('board-2')}
      >
        {props.label}
      </button>
    );
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
      searchPlaceholder: 'Search boards...',
      selected: 'board-1',
    });
    expect(comboboxProps?.showSelectedIcon).toBeUndefined();
    expect(comboboxProps?.options.some((option) => option.icon)).toBe(true);

    fireEvent.click(screen.getByTestId('board-combobox'));

    expect(pushMock).toHaveBeenCalledWith('/ws-1/tasks/boards/board-2');
  });
});
