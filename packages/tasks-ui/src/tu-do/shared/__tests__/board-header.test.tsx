import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SidebarContext } from '@tuturuuu/ui/custom/sidebar-context';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardHeader } from '../board-header';

const navigationMocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));
const internalApiMocks = vi.hoisted(() => ({
  getWorkspaceTaskBoard: vi.fn(),
}));
const comboboxMocks = vi.hoisted(() => ({
  seenOptions: [] as { description?: string; label: string; value: string }[][],
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
  Combobox: function MockCombobox({
    ariaLabel,
    className,
    colorizeTriggerIcon,
    disabled,
    hideTriggerLabel,
    onChange,
    options,
    placeholder,
    selected,
    triggerIcon,
    triggerTooltip,
  }: {
    ariaLabel?: string;
    className?: string;
    colorizeTriggerIcon?: boolean;
    disabled?: boolean;
    hideTriggerLabel?: boolean;
    onChange?: (value: string) => void;
    options: { description?: string; label: string; value: string }[];
    placeholder?: string;
    selected: string;
    triggerIcon?: React.ReactNode;
    triggerTooltip?: React.ReactNode;
  }) {
    comboboxMocks.seenOptions.push(options);

    return (
      <select
        aria-label={
          ariaLabel ??
          (hideTriggerLabel
            ? options.find((option) => option.value === selected)?.label
            : placeholder)
        }
        className={className}
        data-colorize-trigger-icon={String(colorizeTriggerIcon)}
        data-has-trigger-icon={String(Boolean(triggerIcon))}
        data-trigger-tooltip={
          typeof triggerTooltip === 'string' ? triggerTooltip : undefined
        }
        disabled={disabled}
        value={selected}
        onChange={(event) => onChange?.(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  },
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
  overrides?: Partial<React.ComponentProps<typeof BoardHeader>>,
  sidebarContext?: React.ContextType<typeof SidebarContext>
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const content = (
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

  return render(
    sidebarContext ? (
      <SidebarContext.Provider value={sidebarContext}>
        {content}
      </SidebarContext.Provider>
    ) : (
      content
    )
  );
}

describe('BoardHeader', () => {
  beforeEach(() => {
    comboboxMocks.seenOptions = [];
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

  it('renders a compact hide-sidebar button when sidebar context is available', () => {
    const handleBehaviorChange = vi.fn();

    renderBoardHeader(undefined, {
      behavior: 'expanded',
      handleBehaviorChange,
      localOverride: false,
      setBehavior: vi.fn(),
      setLocalOverride: vi.fn(),
    });

    const hideButton = screen.getByRole('button', {
      name: 'common.hide_sidebar',
    });

    expect(hideButton).toHaveClass('border', 'h-7', 'w-7', 'px-0');
    fireEvent.click(hideButton);
    expect(handleBehaviorChange).toHaveBeenCalledWith('hidden');
  });

  it('does not render the hide-sidebar button without context or when already hidden', () => {
    const { rerender } = renderBoardHeader();

    expect(
      screen.queryByRole('button', { name: 'common.hide_sidebar' })
    ).not.toBeInTheDocument();

    rerender(
      <SidebarContext.Provider
        value={{
          behavior: 'hidden',
          handleBehaviorChange: vi.fn(),
          localOverride: false,
          setBehavior: vi.fn(),
          setLocalOverride: vi.fn(),
        }}
      >
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
            isPersonalWorkspace={false}
            listStatusFilter="all"
            onFiltersChange={vi.fn()}
            onListStatusFilterChange={vi.fn()}
            onUpdate={vi.fn()}
            onViewChange={vi.fn()}
            setIsMultiSelectMode={vi.fn()}
          />
        </QueryClientProvider>
      </SidebarContext.Provider>
    );

    expect(
      screen.queryByRole('button', { name: 'common.hide_sidebar' })
    ).not.toBeInTheDocument();
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

  it('does not broadcast a second settings dialog open request', () => {
    const handleSettingsIntent = vi.fn();
    window.addEventListener(
      'tuturuuu:settings-dialog-open-intent',
      handleSettingsIntent
    );

    renderBoardHeader();

    const settingsButton = screen.getByRole('button', {
      name: 'ws-task-boards.actions.board_settings',
    });
    fireEvent.pointerDown(settingsButton);
    fireEvent.click(settingsButton);

    expect(handleSettingsIntent).not.toHaveBeenCalled();

    window.removeEventListener(
      'tuturuuu:settings-dialog-open-intent',
      handleSettingsIntent
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

  it('hides the board picker when showing My Tasks', () => {
    renderBoardHeader({
      currentView: 'my_tasks',
    });

    expect(screen.queryByTestId('board-switcher')).not.toBeInTheDocument();
    expect(
      screen.getByText('ws-task-boards.views.my_tasks')
    ).toBeInTheDocument();
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

  it('shows presence avatars for workspace boards', () => {
    renderBoardHeader();

    expect(screen.getByTestId('board-user-presence')).toBeInTheDocument();
  });

  it('hides presence avatars for unshared personal boards', () => {
    renderBoardHeader({
      isPersonalWorkspace: true,
    });

    expect(screen.queryByTestId('board-user-presence')).not.toBeInTheDocument();
  });

  it('shows presence avatars for personal boards shared with guests', () => {
    renderBoardHeader({
      board: {
        ...mockBoard,
        has_guest_access: true,
      },
      isPersonalWorkspace: true,
    });

    expect(screen.getByTestId('board-user-presence')).toBeInTheDocument();
  });

  it('shows presence avatars for direct board guest access', () => {
    renderBoardHeader({
      board: {
        ...mockBoard,
        access_type: 'guest',
      },
      isPersonalWorkspace: true,
    });

    expect(screen.getByTestId('board-user-presence')).toBeInTheDocument();
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

  it('uses short board view descriptions including drafts and recycle bin keys', () => {
    renderBoardHeader({
      availableViews: ['kanban', 'list', 'timeline', 'drafts', 'recycle_bin'],
    });

    const viewOptions = comboboxMocks.seenOptions.find((options) =>
      options.some((option) => option.value === 'kanban')
    );

    expect(viewOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 'kanban',
          description: 'ws-task-boards.views.kanban_description',
        }),
        expect.objectContaining({
          value: 'list',
          description: 'ws-task-boards.views.list_description',
        }),
        expect.objectContaining({
          value: 'timeline',
          description: 'ws-task-boards.views.timeline_description',
        }),
        expect.objectContaining({
          value: 'drafts',
          description: 'task-drafts.board_view_description',
        }),
        expect.objectContaining({
          value: 'recycle_bin',
          description: 'common.recycle_bin_board_description',
        }),
      ])
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
    expect(view).toHaveAttribute('data-has-trigger-icon', 'true');
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
