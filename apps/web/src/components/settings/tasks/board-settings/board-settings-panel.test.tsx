import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardSettingsPanel } from './board-settings-panel';

const {
  getWorkspaceTaskBoardMock,
  listWorkspaceTaskBoardsMock,
  setSettingsQueryMock,
} = vi.hoisted(() => ({
  getWorkspaceTaskBoardMock: vi.fn(),
  listWorkspaceTaskBoardsMock: vi.fn(),
  setSettingsQueryMock: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('nuqs', () => ({
  parseAsString: {},
  useQueryStates: () => [{ settingsBoardId: 'board-1' }, setSettingsQueryMock],
}));

vi.mock('@tuturuuu/ui/tabs', async () => {
  const React = await import('react');
  const TabsContext = React.createContext<{
    activeValue: string;
    setActiveValue: (value: string) => void;
  } | null>(null);

  return {
    Tabs: ({
      children,
      defaultValue,
      onValueChange,
      value,
    }: {
      children: ReactNode;
      defaultValue?: string;
      onValueChange?: (value: string) => void;
      value?: string;
    }) => {
      const [uncontrolledValue, setUncontrolledValue] =
        React.useState(defaultValue);
      const activeValue = value ?? uncontrolledValue ?? '';
      const setActiveValue = (nextValue: string) => {
        setUncontrolledValue(nextValue);
        onValueChange?.(nextValue);
      };

      return (
        <TabsContext.Provider value={{ activeValue, setActiveValue }}>
          <div>{children}</div>
        </TabsContext.Provider>
      );
    },
    TabsContent: ({
      children,
      value,
    }: {
      children: ReactNode;
      value: string;
    }) => {
      const context = React.useContext(TabsContext);
      return context?.activeValue === value ? <div>{children}</div> : null;
    },
    TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    TabsTrigger: ({
      children,
      value,
    }: {
      children: ReactNode;
      value: string;
    }) => {
      const context = React.useContext(TabsContext);

      return (
        <button
          onClick={() => context?.setActiveValue(value)}
          role="tab"
          type="button"
        >
          {children}
        </button>
      );
    },
  };
});

vi.mock('@tuturuuu/internal-api/tasks', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/internal-api/tasks')>();

  return {
    ...actual,
    getWorkspaceTaskBoard: (
      ...args: Parameters<typeof getWorkspaceTaskBoardMock>
    ) => getWorkspaceTaskBoardMock(...args),
    listWorkspaceTaskBoards: (
      ...args: Parameters<typeof listWorkspaceTaskBoardsMock>
    ) => listWorkspaceTaskBoardsMock(...args),
  };
});

vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: ({
    ariaLabel,
    disabled,
    label,
    onChange,
    onOpenChange,
    options,
    placeholder,
    selected,
  }: {
    ariaLabel?: string;
    disabled?: boolean;
    label?: ReactNode;
    onChange?: (value: string) => void;
    onOpenChange?: (open: boolean) => void;
    options: { label: string; value: string }[];
    placeholder?: string;
    selected: string;
  }) => (
    <label>
      <span>{label ?? placeholder}</span>
      <button
        aria-label={`open ${ariaLabel ?? placeholder ?? 'combobox'}`}
        onClick={() => onOpenChange?.(true)}
        type="button"
      >
        open {ariaLabel ?? placeholder ?? 'combobox'}
      </button>
      <select
        aria-label={ariaLabel ?? placeholder}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
        value={selected}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange?.(option.value)}
          type="button"
        >
          select {option.label}
        </button>
      ))}
    </label>
  ),
}));

vi.mock('@tuturuuu/ui/custom/icon-picker', () => ({
  default: ({ value }: { value?: string | null }) => (
    <button type="button">icon-picker:{value ?? 'none'}</button>
  ),
  getIconComponentByKey: () =>
    function MockIcon() {
      return <span data-testid="board-icon" />;
    },
}));

vi.mock('@tuturuuu/tasks-ui/tu-do/shared/board-layout-settings', () => ({
  BoardLayoutSettingsContent: () => (
    <div data-testid="board-layout-settings-content" />
  ),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const board = {
  allow_zero_estimates: true,
  archived_at: null,
  count_unestimated_issues: false,
  created_at: '2026-06-22T00:00:00.000Z',
  default_list_id: 'list-1',
  deleted_at: null,
  estimation_type: null,
  extended_estimation: false,
  icon: 'ListTodo',
  id: 'board-1',
  name: 'Roadmap',
  task_lists: [
    {
      color: 'GRAY',
      deleted: false,
      id: 'list-1',
      name: 'To Do',
      position: 0,
      status: 'not_started',
    },
  ],
  ticket_prefix: 'RD',
  ws_id: 'ws-1',
};

function renderBoardSettingsPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BoardSettingsPanel boardId="board-1" wsId="ws-1" />
    </QueryClientProvider>
  );
}

describe('BoardSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWorkspaceTaskBoardMock.mockResolvedValue({ board });
    listWorkspaceTaskBoardsMock.mockResolvedValue({
      boards: [
        board,
        {
          ...board,
          default_list_id: null,
          id: 'board-2',
          name: 'Launch',
          ticket_prefix: 'LA',
        },
      ],
      count: 2,
    });
  });

  it('renders current board context and switches the settings target only', async () => {
    renderBoardSettingsPanel();

    expect((await screen.findAllByText('Roadmap')).length).toBeGreaterThan(0);
    expect(listWorkspaceTaskBoardsMock).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'open common.search_boards' })
    );

    await waitFor(() => {
      expect(listWorkspaceTaskBoardsMock).toHaveBeenCalledWith(
        'ws-1',
        { pageSize: 100, status: 'all' },
        expect.objectContaining({ baseUrl: expect.any(String) })
      );
    });

    fireEvent.click(
      await screen.findByRole('button', { name: 'select Launch' })
    );

    await waitFor(() => {
      expect(setSettingsQueryMock).toHaveBeenCalledWith({
        settingsBoardId: 'board-2',
      });
    });
  });

  it('renders a compact board settings loading shell while the board query resolves', () => {
    getWorkspaceTaskBoardMock.mockReturnValue(new Promise(() => {}));

    renderBoardSettingsPanel();

    expect(
      screen.getByTestId('board-settings-loading-state')
    ).toBeInTheDocument();
  });

  it('uses a current-board details form instead of the generic board form', async () => {
    renderBoardSettingsPanel();

    expect(await screen.findByLabelText('ws-task-boards.name')).toHaveValue(
      'Roadmap'
    );
    expect(
      screen.getByText('ws-task-boards.icon_label').parentElement
    ).toHaveTextContent('icon-picker:ListTodo');
    expect(screen.getByLabelText('settings.tasks.ticket_prefix')).toHaveValue(
      'RD'
    );
    expect(screen.queryByTestId('task-board-form')).not.toBeInTheDocument();
    expect(screen.queryByText('ws-task-boards.create')).not.toBeInTheDocument();
  });

  it('renders board layout controls inline in the layout tab', async () => {
    renderBoardSettingsPanel();

    await screen.findByLabelText('ws-task-boards.name');

    expect(
      screen.queryByTestId('board-layout-settings-content')
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('tab', {
        name: 'settings.tasks.board_layout',
      })
    );

    expect(
      screen.getByTestId('board-layout-settings-content')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('settings.tasks.open_board_layout')
    ).not.toBeInTheDocument();
  });
});
