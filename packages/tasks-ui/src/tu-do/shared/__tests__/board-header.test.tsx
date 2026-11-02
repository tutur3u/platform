import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SidebarContext } from '@tuturuuu/ui/custom/sidebar-context';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveBoardRefresh } from '../board-broadcast-context';
import { BoardHeader } from '../board-header';
import { DEFAULT_BOARD_FILTERS } from '../board-header/board-filter-state';

const navigationMocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));
const internalApiMocks = vi.hoisted(() => ({
  getWorkspaceTaskBoard: vi.fn(),
  listWorkspaceTaskProjects: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values && 'name' in values ? `${key}:${values.name}` : key,
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
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  getWorkspaceTaskBoard: (
    ...args: Parameters<typeof internalApiMocks.getWorkspaceTaskBoard>
  ) => internalApiMocks.getWorkspaceTaskBoard(...args),
  listWorkspaceTaskProjects: (
    ...args: Parameters<typeof internalApiMocks.listWorkspaceTaskProjects>
  ) => internalApiMocks.listWorkspaceTaskProjects(...args),
}));

// Menus render inline so items are reachable without pointer simulation.
vi.mock('@tuturuuu/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
    role = 'menuitem',
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
    role?: string;
  }) => (
    <button
      disabled={disabled}
      onClick={() => onSelect?.()}
      role={role}
      type="button"
    >
      {children}
    </button>
  ),
  DropdownMenuCheckboxItem: ({
    checked,
    children,
    onCheckedChange,
  }: {
    checked?: boolean;
    children: React.ReactNode;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <button
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
      role="menuitemcheckbox"
      type="button"
    >
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuShortcut: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
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

vi.mock('../../boards/boardId/kanban/planner/kanban-planner-dialog', () => ({
  KanbanPlannerDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">planner-dialog</div> : null,
}));

vi.mock('../../boards/board-share-dialog', () => ({
  BoardShareDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">share-dialog</div> : null,
}));

vi.mock('../../boards/create-board-anywhere-dialog', () => ({
  CreateBoardAnywhereDialog: ({ open }: { open?: boolean }) =>
    open ? <div role="dialog">create-board-dialog</div> : null,
}));

const mockBoard = {
  archived_at: null,
  id: 'board-1',
  name: 'Roadmap',
  ticket_prefix: 'RD',
  ws_id: 'ws-1',
} as const;

const people = [
  {
    id: 'me',
    display_name: 'Linh',
    avatar_url: null,
    email: null,
    taskCount: 3,
  },
  {
    id: 'minh',
    display_name: 'Minh',
    avatar_url: null,
    email: null,
    taskCount: 2,
  },
];

type HeaderProps = React.ComponentProps<typeof BoardHeader>;

function headerElement(overrides?: Partial<HeaderProps>) {
  return (
    <BoardHeader
      workspaceId="ws-1"
      board={mockBoard}
      currentUserId="me"
      currentView="kanban"
      filters={DEFAULT_BOARD_FILTERS}
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
  );
}

function renderBoardHeader(
  overrides?: Partial<HeaderProps>,
  sidebarContext?: React.ContextType<typeof SidebarContext>
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const content = (
    <QueryClientProvider client={queryClient}>
      {headerElement(overrides)}
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

const expandedSidebar = (handleBehaviorChange = vi.fn()) => ({
  behavior: 'expanded' as const,
  handleBehaviorChange,
  localOverride: false,
  setBehavior: vi.fn(),
  setLocalOverride: vi.fn(),
});

describe('BoardHeader', () => {
  beforeEach(() => {
    navigationMocks.replace.mockReset();
    internalApiMocks.getWorkspaceTaskBoard.mockReset();
    internalApiMocks.getWorkspaceTaskBoard.mockResolvedValue({
      board: mockBoard,
    });
    internalApiMocks.listWorkspaceTaskProjects.mockReset();
    internalApiMocks.listWorkspaceTaskProjects.mockResolvedValue([
      { id: 'p-platform', name: 'Platform', status: 'active' },
      { id: 'p-gone', name: 'Gone', status: 'deleted' },
    ]);
    setActiveBoardRefresh(null);
  });

  it('refreshes the active board from More', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const onUpdate = vi.fn();
    setActiveBoardRefresh(refresh);
    renderBoardHeader({ onUpdate });

    fireEvent.click(screen.getByRole('menuitem', { name: 'common.refresh' }));

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledWith({ includeLists: true });
      expect(onUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps search, Share, New task and More in the first row', () => {
    const onCreateTask = vi.fn();
    renderBoardHeader({ onCreateTask });

    expect(screen.getByLabelText('common.search_tasks')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'ws-task-boards.header.share' })
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('share-dialog');

    fireEvent.click(
      screen.getByRole('button', { name: 'ws-task-boards.header.new_task' })
    );
    expect(onCreateTask).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'ws-task-boards.header.more' })
    ).toBeInTheDocument();
  });

  it('opens Create board from More', () => {
    renderBoardHeader();

    fireEvent.click(
      screen.getByRole('menuitem', {
        name: 'ws-task-boards.create_anywhere.action',
      })
    );

    expect(screen.getByRole('dialog')).toHaveTextContent('create-board-dialog');
  });

  it('toggles task selection from More', () => {
    const setIsMultiSelectMode = vi.fn();
    renderBoardHeader({ setIsMultiSelectMode });

    fireEvent.click(
      screen.getByRole('menuitem', { name: /common\.choose_tasks/ })
    );

    expect(setIsMultiSelectMode).toHaveBeenCalledWith(true);
  });

  it('hides the sidebar from More when sidebar context is available', () => {
    const handleBehaviorChange = vi.fn();
    renderBoardHeader(undefined, expandedSidebar(handleBehaviorChange));

    fireEvent.click(
      screen.getByRole('menuitem', { name: 'common.hide_sidebar' })
    );
    expect(handleBehaviorChange).toHaveBeenCalledWith('hidden');
  });

  it('does not offer hide-sidebar without context or when already hidden', () => {
    const { rerender } = renderBoardHeader();
    expect(
      screen.queryByRole('menuitem', { name: 'common.hide_sidebar' })
    ).not.toBeInTheDocument();

    rerender(
      <SidebarContext.Provider
        value={{ ...expandedSidebar(), behavior: 'hidden' }}
      >
        <QueryClientProvider client={new QueryClient()}>
          {headerElement()}
        </QueryClientProvider>
      </SidebarContext.Provider>
    );
    expect(
      screen.queryByRole('menuitem', { name: 'common.hide_sidebar' })
    ).not.toBeInTheDocument();
  });

  it('prefetches board settings when More is hovered', async () => {
    const onBoardSettingsIntent = vi.fn();
    renderBoardHeader({ onBoardSettingsIntent });

    fireEvent.pointerEnter(
      screen.getByRole('button', { name: 'ws-task-boards.header.more' })
    );

    expect(onBoardSettingsIntent).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(internalApiMocks.getWorkspaceTaskBoard).toHaveBeenCalledWith(
        'ws-1',
        'board-1',
        expect.objectContaining({ baseUrl: expect.any(String) })
      );
    });
  });

  it('opens contextual board settings through query state', () => {
    renderBoardHeader();

    fireEvent.click(
      screen.getByRole('menuitem', {
        name: 'ws-task-boards.actions.board_settings',
      })
    );

    expect(navigationMocks.replace).toHaveBeenCalledWith(
      '/ws-1/tasks/boards/board-1?existing=1&settingsDialog=open&settingsTab=task_board&settingsBoardId=board-1',
      { scroll: false }
    );
  });

  it('uses one claimed settings intent instead of racing the URL fallback', () => {
    const handleSettingsIntent = vi.fn();
    const claimSettingsIntent = (event: Event) => {
      event.preventDefault();
      handleSettingsIntent();
    };
    window.addEventListener(
      'tuturuuu:settings-dialog-open-intent',
      claimSettingsIntent
    );

    renderBoardHeader();
    fireEvent.click(
      screen.getByRole('menuitem', {
        name: 'ws-task-boards.actions.board_settings',
      })
    );

    expect(handleSettingsIntent).toHaveBeenCalledTimes(1);
    expect(navigationMocks.replace).not.toHaveBeenCalled();

    window.removeEventListener(
      'tuturuuu:settings-dialog-open-intent',
      claimSettingsIntent
    );
  });

  it('renders a natural public title and hides member-only controls in read-only mode', () => {
    renderBoardHeader({
      people,
      projectTaskCounts: new Map(),
      publicView: true,
      readOnly: true,
      titlePrefix: <span data-testid="public-title-prefix">Tuturuuu /</span>,
    });

    expect(screen.queryByTestId('board-switcher')).not.toBeInTheDocument();
    expect(screen.getByTestId('public-title-prefix')).toBeInTheDocument();
    expect(screen.getByText('Roadmap')).toBeInTheDocument();
    expect(screen.queryByTestId('board-user-presence')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'ws-task-boards.header.share' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'ws-task-boards.header.more' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Linh')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /ws-task-boards\.header\.focus/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'common.sort' })
    ).toBeInTheDocument();
  });

  it('hides the board picker when showing My Tasks', () => {
    renderBoardHeader({ currentView: 'my_tasks' });

    expect(screen.queryByTestId('board-switcher')).not.toBeInTheDocument();
    expect(
      screen.getAllByText('ws-task-boards.views.my_tasks').length
    ).toBeGreaterThan(0);
  });

  it('offers the personal planner in More only on personal kanban', () => {
    const { rerender } = renderBoardHeader({ isPersonalWorkspace: true });

    fireEvent.click(
      screen.getByRole('menuitem', { name: 'ws-task-plans.planner' })
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('planner');

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        {headerElement({ currentView: 'list', isPersonalWorkspace: true })}
      </QueryClientProvider>
    );
    expect(
      screen.queryByRole('menuitem', { name: 'ws-task-plans.planner' })
    ).not.toBeInTheDocument();
  });

  it.each([
    ['workspace boards', {}, true],
    ['unshared personal boards', { isPersonalWorkspace: true }, false],
    [
      'personal boards shared with guests',
      {
        board: { ...mockBoard, has_guest_access: true },
        isPersonalWorkspace: true,
      },
      true,
    ],
    [
      'direct board guest access',
      {
        board: { ...mockBoard, access_type: 'guest' as const },
        isPersonalWorkspace: true,
      },
      true,
    ],
  ])('presence avatars for %s', (_label, overrides, visible) => {
    renderBoardHeader(overrides as Partial<HeaderProps>);
    expect(Boolean(screen.queryByTestId('board-user-presence'))).toBe(visible);
  });

  it('filters by person pills where picking yourself is Mine', () => {
    const onFiltersChange = vi.fn();
    renderBoardHeader({ onFiltersChange, people, unassignedCount: 1 });

    fireEvent.click(screen.getByRole('button', { name: /Linh/ }));
    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        assignees: [expect.objectContaining({ id: 'me' })],
        includeMyTasks: true,
      })
    );

    fireEvent.click(screen.getByRole('button', { name: /common\.unassigned/ }));
    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ assignees: [], includeUnassigned: true })
    );
  });

  it('turns Focus on as my open tasks by priority', () => {
    const onFiltersChange = vi.fn();
    const onListStatusFilterChange = vi.fn();
    renderBoardHeader({ onFiltersChange, onListStatusFilterChange, people });

    fireEvent.click(
      screen.getByRole('button', { name: /ws-task-boards\.header\.focus/ })
    );

    expect(onListStatusFilterChange).toHaveBeenCalledWith('open');
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        includeMyTasks: true,
        sortBy: 'priority-high',
      })
    );
  });

  it('filters by project from the dropdown, skipping deleted projects', async () => {
    const onFiltersChange = vi.fn();
    renderBoardHeader({
      onFiltersChange,
      projectTaskCounts: new Map([['p-platform', 4]]),
    });

    const platform = await screen.findByRole('menuitemcheckbox', {
      name: /Platform/,
    });
    expect(platform).toHaveTextContent('4');
    expect(screen.queryByText('Gone')).not.toBeInTheDocument();

    fireEvent.click(platform);
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        projects: [{ id: 'p-platform', name: 'Platform' }],
      })
    );
  });

  it('keeps people, Unassigned and projects usable while hiding partial counts', async () => {
    const onFiltersChange = vi.fn();
    renderBoardHeader({
      onFiltersChange,
      people: [
        ...people,
        ...['An', 'Binh', 'Chi', 'Dung'].map((name) => ({
          id: name,
          display_name: name,
          taskCount: 0,
        })),
      ],
      unassignedCount: 0,
      projectTaskCounts: new Map([['p-platform', 4]]),
      countsComplete: false,
    });

    expect(screen.getByRole('button', { name: /Linh/ })).toHaveAttribute(
      'title',
      'ws-task-boards.header.you:Linh'
    );
    const unassigned = screen.getByRole('button', {
      name: 'common.unassigned',
    });
    expect(unassigned).toHaveAttribute('title', 'common.unassigned');
    fireEvent.click(unassigned);
    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeUnassigned: true })
    );
    // Overflow people keep their avatar initial but show no partial count.
    expect(
      screen.getByRole('menuitemcheckbox', { name: /Dung$/ })
    ).not.toHaveTextContent(/\d/);
    const project = await screen.findByRole('menuitemcheckbox', {
      name: 'Platform',
    });
    expect(project).toHaveTextContent(/^Platform$/);
    fireEvent.click(project);
    expect(onFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        projects: [{ id: 'p-platform', name: 'Platform' }],
      })
    );
  });

  it('sorts by priority only and switches views with shortcuts shown', () => {
    const onFiltersChange = vi.fn();
    const onViewChange = vi.fn();
    renderBoardHeader({
      availableViews: ['kanban', 'list', 'timeline', 'drafts'],
      onFiltersChange,
      onViewChange,
      viewHotkeyLabels: { list: 'G L' },
    });

    fireEvent.click(
      screen.getByRole('menuitemradio', {
        name: /ws-task-boards\.filters\.sort_options\.high_to_low/,
      })
    );
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'priority-high' })
    );
    expect(screen.queryByText(/due_date/)).not.toBeInTheDocument();

    const listItem = screen.getByText('G L').closest('button');
    if (!listItem) throw new Error('list view item missing');
    expect(listItem).toHaveTextContent('G L');
    fireEvent.click(listItem);
    expect(onViewChange).toHaveBeenCalledWith('list');
    expect(screen.getByText('task-drafts.title')).toBeInTheDocument();
    expect(screen.queryByText('common.recycle_bin')).not.toBeInTheDocument();
  });

  it('clears every filter, including the open status scope', () => {
    const onFiltersChange = vi.fn();
    const onListStatusFilterChange = vi.fn();
    renderBoardHeader({
      filters: { ...DEFAULT_BOARD_FILTERS, includeUnassigned: true },
      listStatusFilter: 'open',
      onFiltersChange,
      onListStatusFilterChange,
    });

    fireEvent.click(screen.getByRole('button', { name: 'common.clear' }));

    expect(onFiltersChange).toHaveBeenCalledWith(DEFAULT_BOARD_FILTERS);
    expect(onListStatusFilterChange).toHaveBeenCalledWith('all');
  });

  it('shows the sprint pill after the board in the breadcrumb', () => {
    const { rerender } = renderBoardHeader({
      sprintSlot: <span data-testid="sprint-pill">Sprint 14</span>,
    });

    expect(screen.getByTestId('sprint-pill')).toBeInTheDocument();
    expect(
      screen
        .getByTestId('board-switcher')
        .compareDocumentPosition(screen.getByTestId('sprint-pill'))
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        {headerElement({
          currentView: 'my_tasks',
          sprintSlot: <span data-testid="sprint-pill">Sprint 14</span>,
        })}
      </QueryClientProvider>
    );
    expect(screen.queryByTestId('sprint-pill')).not.toBeInTheDocument();
  });

  it('shows no Clear button while nothing is filtered', () => {
    renderBoardHeader();
    expect(
      screen.queryByRole('button', { name: 'common.clear' })
    ).not.toBeInTheDocument();
  });
});
