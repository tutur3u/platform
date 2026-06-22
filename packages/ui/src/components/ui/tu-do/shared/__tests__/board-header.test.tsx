import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardHeader } from '../board-header';

const navigationMocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));
const internalApiMocks = vi.hoisted(() => ({
  getWorkspaceTaskBoard: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/ws-1/tasks/boards/board-1',
  useRouter: () => ({
    push: vi.fn(),
    replace: navigationMocks.replace,
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams('existing=1'),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('@tuturuuu/ui/hooks/use-board-actions', () => ({
  useBoardActions: () => ({
    archiveBoard: vi.fn(),
    unarchiveBoard: vi.fn(),
  }),
}));

vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: ({
    ariaLabel,
    className,
    colorizeTriggerIcon,
    disabled,
    hideTriggerLabel,
    onChange,
    options,
    placeholder,
    selected,
    triggerTooltip,
  }: {
    ariaLabel?: string;
    className?: string;
    colorizeTriggerIcon?: boolean;
    disabled?: boolean;
    hideTriggerLabel?: boolean;
    onChange?: (value: string) => void;
    options: { label: string; value: string }[];
    placeholder?: string;
    selected: string;
    triggerTooltip?: React.ReactNode;
  }) => (
    <select
      aria-label={
        ariaLabel ??
        (hideTriggerLabel
          ? options.find((option) => option.value === selected)?.label
          : placeholder)
      }
      disabled={disabled}
      className={className}
      data-colorize-trigger-icon={String(colorizeTriggerIcon)}
      data-trigger-tooltip={
        typeof triggerTooltip === 'string' ? triggerTooltip : undefined
      }
      value={selected}
      onChange={(event) => onChange?.(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  getWorkspaceTaskBoard: (
    ...args: Parameters<typeof internalApiMocks.getWorkspaceTaskBoard>
  ) => internalApiMocks.getWorkspaceTaskBoard(...args),
}));

vi.mock('@tuturuuu/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button onClick={onClick} type="button">
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('../tasks-route-context', () => ({
  useTasksHref: () => '/tasks',
}));

vi.mock('../board-switcher', () => ({
  BoardSwitcher: () => <div data-testid="board-switcher" />,
}));

vi.mock('../board-user-presence-avatars', () => ({
  BoardUserPresenceAvatarsComponent: () => (
    <div data-testid="board-user-presence" />
  ),
}));

vi.mock('../boards/boardId/task-filter', () => ({
  TaskFilter: () => <div data-testid="task-filter" />,
}));

vi.mock('../boards/boardId/kanban/planner/kanban-planner-dialog', () => ({
  KanbanPlannerDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">planner-dialog</div> : null,
}));

vi.mock('../boards/board-share-dialog', () => ({
  BoardShareDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">share-dialog</div> : null,
}));

vi.mock('../boards/copy-board-dialog', () => ({
  CopyBoardDialog: () => <div data-testid="copy-board-dialog" />,
}));

vi.mock('../boards/form', () => ({
  TaskBoardForm: () => <div data-testid="task-board-form" />,
}));

vi.mock('../templates/save-as-template-dialog', () => ({
  SaveAsTemplateDialog: () => <div data-testid="save-as-template-dialog" />,
}));

const mockBoard = {
  archived_at: null,
  id: 'board-1',
  name: 'Roadmap',
  ticket_prefix: 'RD',
  ws_id: 'ws-1',
} as const;

function renderBoardHeader(
  overrides?: Partial<React.ComponentProps<typeof BoardHeader>>
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BoardHeader
        workspaceId="ws-1"
        board={mockBoard}
        currentView="kanban"
        filters={{
          assignees: [],
          dueDateRange: null,
          estimationRange: null,
          includeMyTasks: false,
          includeUnassigned: false,
          labels: [],
          priorities: [],
          projects: [],
          sourceBoardIds: [],
          sourceScope: 'all_visible',
          sourceWorkspaceIds: [],
        }}
        isMultiSelectMode={false}
        isPersonalWorkspace={false}
        listStatusFilter="all"
        onFiltersChange={vi.fn()}
        onListStatusFilterChange={vi.fn()}
        onUpdate={vi.fn()}
        onViewChange={vi.fn()}
        setIsMultiSelectMode={vi.fn()}
        {...overrides}
      />
    </QueryClientProvider>
  );
}

describe('BoardHeader', () => {
  beforeEach(() => {
    navigationMocks.replace.mockReset();
    internalApiMocks.getWorkspaceTaskBoard.mockReset();
    internalApiMocks.getWorkspaceTaskBoard.mockResolvedValue({
      board: mockBoard,
    });
  });

  it('renders a direct board settings button with compact outline header styling', () => {
    renderBoardHeader();

    const settingsButton = screen.getByRole('button', {
      name: 'ws-task-boards.actions.board_settings',
    });

    expect(settingsButton).toHaveClass('border', 'h-7', 'w-7', 'px-0');
    expect(settingsButton).toHaveClass('sm:h-8', 'sm:w-8');
    expect(settingsButton).not.toHaveTextContent(
      'ws-task-boards.actions.board_settings'
    );
  });

  it('prefetches current board settings before opening the dialog', async () => {
    renderBoardHeader();

    fireEvent.mouseEnter(
      screen.getByRole('button', {
        name: 'ws-task-boards.actions.board_settings',
      })
    );

    await waitFor(() => {
      expect(internalApiMocks.getWorkspaceTaskBoard).toHaveBeenCalledWith(
        'ws-1',
        'board-1',
        expect.objectContaining({ baseUrl: expect.any(String) })
      );
    });
  });

  it('calls the board settings intent hook before opening the dialog', () => {
    const onBoardSettingsIntent = vi.fn();

    renderBoardHeader({ onBoardSettingsIntent });

    fireEvent.pointerDown(
      screen.getByRole('button', {
        name: 'ws-task-boards.actions.board_settings',
      })
    );

    expect(onBoardSettingsIntent).toHaveBeenCalledTimes(1);
  });

  it('opens contextual board settings through query state', () => {
    renderBoardHeader();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'ws-task-boards.actions.board_settings',
      })
    );

    expect(navigationMocks.replace).toHaveBeenCalledWith(
      '/ws-1/tasks/boards/board-1?existing=1&settingsDialog=open&settingsTab=task_board&settingsBoardId=board-1',
      { scroll: false }
    );
  });

  it('renders a natural public title and hides member-only controls in read-only mode', () => {
    renderBoardHeader({
      publicView: true,
      readOnly: true,
      titlePrefix: <span data-testid="public-title-prefix">Tuturuuu /</span>,
    });

    expect(screen.queryByTestId('board-switcher')).not.toBeInTheDocument();
    expect(screen.getByTestId('public-title-prefix')).toBeInTheDocument();
    expect(screen.getByText('Roadmap')).toBeInTheDocument();
    expect(screen.queryByTestId('board-user-presence')).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-filter')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('ws-task-boards.share.action')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('ws-task-plans.planner')
    ).not.toBeInTheDocument();
  });

  it('shows planner as a personal kanban toolbar button and opens the dialog', () => {
    renderBoardHeader({
      isPersonalWorkspace: true,
    });

    fireEvent.click(screen.getByLabelText('ws-task-plans.planner'));

    expect(screen.getByRole('dialog')).toHaveTextContent('planner');
  });

  it('hides planner outside personal kanban editing', () => {
    const { rerender } = renderBoardHeader({
      currentView: 'list',
      isPersonalWorkspace: true,
    });

    expect(
      screen.queryByLabelText('ws-task-plans.planner')
    ).not.toBeInTheDocument();

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <BoardHeader
          workspaceId="ws-1"
          board={mockBoard}
          currentView="kanban"
          filters={{
            assignees: [],
            dueDateRange: null,
            estimationRange: null,
            includeMyTasks: false,
            includeUnassigned: false,
            labels: [],
            priorities: [],
            projects: [],
            sourceBoardIds: [],
            sourceScope: 'all_visible',
            sourceWorkspaceIds: [],
          }}
          isMultiSelectMode={false}
          isPersonalWorkspace
          listStatusFilter="all"
          onFiltersChange={vi.fn()}
          onListStatusFilterChange={vi.fn()}
          onUpdate={vi.fn()}
          onViewChange={vi.fn()}
          publicView
          setIsMultiSelectMode={vi.fn()}
        />
      </QueryClientProvider>
    );

    expect(
      screen.queryByLabelText('ws-task-plans.planner')
    ).not.toBeInTheDocument();
  });

  it('updates status, view, and sort through combobox controls', () => {
    const onFiltersChange = vi.fn();
    const onListStatusFilterChange = vi.fn();
    const onViewChange = vi.fn();

    renderBoardHeader({
      onFiltersChange,
      onListStatusFilterChange,
      onViewChange,
    });

    fireEvent.change(screen.getByLabelText('common.all'), {
      target: { value: 'active' },
    });
    expect(onListStatusFilterChange).toHaveBeenCalledWith('active');

    fireEvent.change(screen.getByLabelText('ws-task-boards.views.kanban'), {
      target: { value: 'list' },
    });
    expect(onViewChange).toHaveBeenCalledWith('list');

    fireEvent.change(screen.getByLabelText('common.sort'), {
      target: { value: 'priority-high' },
    });
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'priority-high' })
    );
  });

  it('passes instant tooltip labels and monochrome trigger mode to toolbar comboboxes', () => {
    renderBoardHeader();

    const status = screen.getByLabelText('common.all');
    const view = screen.getByLabelText('ws-task-boards.views.kanban');
    const sort = screen.getByLabelText('common.sort');

    expect(status).toHaveAttribute(
      'data-trigger-tooltip',
      'common.status: common.all'
    );
    expect(view).toHaveAttribute(
      'data-trigger-tooltip',
      'common.view: ws-task-boards.views.kanban'
    );
    expect(sort).toHaveAttribute(
      'data-trigger-tooltip',
      'common.sort: common.sort'
    );

    for (const control of [status, view, sort]) {
      expect(control).toHaveAttribute('data-colorize-trigger-icon', 'false');
      expect(control.className).toContain('[&_button_svg]:text-current');
    }
  });
});
