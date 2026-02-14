import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────
const { mockUseMyTasksState, mockUseQueryClient, mockUseUserConfig } =
  vi.hoisted(() => ({
    mockUseMyTasksState: vi.fn(),
    mockUseQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn(),
    })),
    mockUseUserConfig: vi.fn(() => ({ data: 'enter' })),
  }));

// Mock the state hook
vi.mock('../use-my-tasks-state', () => ({
  useMyTasksState: (...args: unknown[]) => mockUseMyTasksState(...args),
}));

// Mock TanStack Query
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: mockUseQueryClient,
}));

// Mock useUserConfig
vi.mock('@tuturuuu/ui/hooks/use-user-config', () => ({
  useUserConfig: mockUseUserConfig,
}));

// Mock useAiCredits
vi.mock('@tuturuuu/ui/hooks/use-ai-credits', () => ({
  useAiCredits: () => ({ data: null, isLoading: false }),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// ── Mock child components ──────────────────────────────────────────────────
vi.mock('../my-tasks-header', () => ({
  MyTasksHeader: (props: any) => (
    <div data-testid="my-tasks-header" data-props={JSON.stringify(props)} />
  ),
}));

vi.mock('../command-bar', () => ({
  CommandBar: (props: any) => (
    <div data-testid="command-bar" data-loading={props.isLoading} />
  ),
}));

vi.mock('../ai-credit-indicator', () => ({
  AiCreditIndicator: () => <div data-testid="ai-credit-indicator" />,
}));

vi.mock('../my-tasks-filters', () => ({
  MyTasksFilters: (props: any) => (
    <div data-testid="my-tasks-filters" data-props={JSON.stringify(props)} />
  ),
}));

vi.mock('../task-list', () => ({
  default: (props: any) => (
    <div
      data-testid="task-list"
      data-command-bar-loading={props.commandBarLoading}
    />
  ),
}));

vi.mock('../board-selector-dialog', () => ({
  BoardSelectorDialog: (props: any) => (
    <div data-testid="board-selector-dialog" data-open={props.open} />
  ),
}));

vi.mock('../task-preview-dialog', () => ({
  TaskPreviewDialog: (props: any) => (
    <div data-testid="task-preview-dialog" data-open={props.open} />
  ),
}));

vi.mock(
  '@tuturuuu/ui/tu-do/boards/boardId/task-dialogs/TaskNewLabelDialog',
  () => ({
    TaskNewLabelDialog: (props: any) => (
      <div data-testid="task-new-label-dialog" data-open={props.open} />
    ),
  })
);

vi.mock(
  '@tuturuuu/ui/tu-do/boards/boardId/task-dialogs/TaskNewProjectDialog',
  () => ({
    TaskNewProjectDialog: (props: any) => (
      <div data-testid="task-new-project-dialog" data-open={props.open} />
    ),
  })
);

vi.mock('@tuturuuu/ui/dialog', () => ({
  Dialog: ({ children, open }: any) =>
    open ? <div data-testid="board-creation-dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@tuturuuu/ui/tu-do/boards/form', () => ({
  TaskBoardForm: () => <div data-testid="task-board-form" />,
}));

vi.mock('@tuturuuu/ui/tu-do/shared/create-list-dialog', () => ({
  CreateListDialog: (props: any) => (
    <div data-testid="create-list-dialog" data-open={props.open} />
  ),
}));

// ── Import after mocks ─────────────────────────────────────────────────────
import MyTasksContent from '../my-tasks-content';

// ── Helpers ────────────────────────────────────────────────────────────────
function createDefaultState(overrides?: Record<string, any>) {
  return {
    // Query data
    queryData: {
      overdue: [],
      today: [],
      upcoming: [],
      totalActiveTasks: 0,
      totalCompletedTasks: 0,
    },
    queryLoading: false,
    completedTasks: [],
    hasMoreCompleted: false,
    fetchMoreCompleted: vi.fn(),
    isFetchingMoreCompleted: false,
    totalCompletedTasks: 0,

    // State
    boardSelectorOpen: false,
    setBoardSelectorOpen: vi.fn(),
    selectedWorkspaceId: 'ws-1',
    setSelectedWorkspaceId: vi.fn(),
    selectedBoardId: '',
    setSelectedBoardId: vi.fn(),
    selectedListId: '',
    setSelectedListId: vi.fn(),
    newBoardDialogOpen: false,
    setNewBoardDialogOpen: vi.fn(),
    newBoardName: '',
    setNewBoardName: vi.fn(),
    newListDialogOpen: false,
    setNewListDialogOpen: vi.fn(),
    newListName: '',
    setNewListName: vi.fn(),
    commandBarLoading: false,
    commandBarInput: '',
    setCommandBarInput: vi.fn(),
    pendingTaskTitle: '',
    setPendingTaskTitle: vi.fn(),
    taskCreatorMode: null,
    setTaskCreatorMode: vi.fn(),
    aiGenerateDescriptions: true,
    setAiGenerateDescriptions: vi.fn(),
    aiGeneratePriority: true,
    setAiGeneratePriority: vi.fn(),
    aiGenerateLabels: true,
    setAiGenerateLabels: vi.fn(),
    autoAssignToMe: true,
    setAutoAssignToMe: vi.fn(),
    previewOpen: false,
    setPreviewOpen: vi.fn(),
    previewEntry: null,
    lastResult: null,
    selectedLabelIds: [],
    setSelectedLabelIds: vi.fn(),
    currentPreviewIndex: 0,
    setCurrentPreviewIndex: vi.fn(),
    collapsedSections: {
      overdue: true,
      today: true,
      upcoming: true,
      completed: true,
    },
    toggleSection: vi.fn(),
    taskFilters: {
      workspaceIds: ['all'],
      boardIds: ['all'],
      labelIds: [],
      projectIds: [],
      selfManagedOnly: false,
    },
    setTaskFilters: vi.fn(),
    newLabelDialogOpen: false,
    setNewLabelDialogOpen: vi.fn(),
    newLabelName: '',
    setNewLabelName: vi.fn(),
    newLabelColor: '#3b82f6',
    setNewLabelColor: vi.fn(),
    creatingLabel: false,
    newProjectDialogOpen: false,
    setNewProjectDialogOpen: vi.fn(),
    newProjectName: '',
    setNewProjectName: vi.fn(),
    creatingProject: false,

    // Data
    workspacesData: [],
    allBoardsData: [],
    boardsData: [],
    boardsLoading: false,
    workspaceLabels: [],
    workspaceProjects: [],
    workspaceMembers: [],
    boardConfig: null,
    availableLists: [],
    selectedDestination: null,
    availableLabels: [],
    availableProjects: [],
    filteredTasks: { overdueTasks: [], todayTasks: [], upcomingTasks: [] },

    // Mutations
    previewMutation: { isPending: false },
    createTasksMutation: { isPending: false },

    // AI flow
    aiFlowStep: 'idle',
    confirmedTasks: [],

    // Handlers
    handleUpdate: vi.fn(),
    handleCreateTask: vi.fn(),
    handleGenerateAI: vi.fn(),
    handleConfirmReview: vi.fn(),
    handleBoardSelectorConfirm: vi.fn(),
    handleClearDestination: vi.fn(),
    handleFilterChange: vi.fn(),
    handleLabelFilterChange: vi.fn(),
    handleProjectFilterChange: vi.fn(),
    handleCreateNewLabel: vi.fn(),
    handleCreateNewProject: vi.fn(),

    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════════════
describe('MyTasksContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMyTasksState.mockReturnValue(createDefaultState());
  });

  // ── Core component rendering ─────────────────────────────────────────────
  describe('renders core components', () => {
    it('renders MyTasksHeader', () => {
      render(<MyTasksContent wsId="ws-1" userId="user-1" isPersonal={false} />);
      expect(screen.getByTestId('my-tasks-header')).toBeInTheDocument();
    });

    it('renders CommandBar', () => {
      render(<MyTasksContent wsId="ws-1" userId="user-1" isPersonal={false} />);
      expect(screen.getByTestId('command-bar')).toBeInTheDocument();
    });

    it('renders AiCreditIndicator', () => {
      render(<MyTasksContent wsId="ws-1" userId="user-1" isPersonal={false} />);
      expect(screen.getByTestId('ai-credit-indicator')).toBeInTheDocument();
    });

    it('renders TaskList', () => {
      render(<MyTasksContent wsId="ws-1" userId="user-1" isPersonal={false} />);
      expect(screen.getByTestId('task-list')).toBeInTheDocument();
    });

    it('renders BoardSelectorDialog', () => {
      render(<MyTasksContent wsId="ws-1" userId="user-1" isPersonal={false} />);
      expect(screen.getByTestId('board-selector-dialog')).toBeInTheDocument();
    });

    it('renders TaskPreviewDialog', () => {
      render(<MyTasksContent wsId="ws-1" userId="user-1" isPersonal={false} />);
      expect(screen.getByTestId('task-preview-dialog')).toBeInTheDocument();
    });

    it('renders TaskNewLabelDialog', () => {
      render(<MyTasksContent wsId="ws-1" userId="user-1" isPersonal={false} />);
      expect(screen.getByTestId('task-new-label-dialog')).toBeInTheDocument();
    });

    it('renders TaskNewProjectDialog', () => {
      render(<MyTasksContent wsId="ws-1" userId="user-1" isPersonal={false} />);
      expect(screen.getByTestId('task-new-project-dialog')).toBeInTheDocument();
    });
  });

  // ── Conditional rendering ────────────────────────────────────────────────
  describe('conditional rendering', () => {
    it('shows MyTasksFilters when isPersonal is true', () => {
      render(<MyTasksContent wsId="ws-1" userId="user-1" isPersonal={true} />);
      expect(screen.getByTestId('my-tasks-filters')).toBeInTheDocument();
    });

    it('hides MyTasksFilters when isPersonal is false', () => {
      render(<MyTasksContent wsId="ws-1" userId="user-1" isPersonal={false} />);
      expect(screen.queryByTestId('my-tasks-filters')).not.toBeInTheDocument();
    });

    it('shows CreateListDialog only when selectedBoardId is set', () => {
      mockUseMyTasksState.mockReturnValue(
        createDefaultState({ selectedBoardId: 'board-123' })
      );

      render(<MyTasksContent wsId="ws-1" userId="user-1" isPersonal={false} />);
      expect(screen.getByTestId('create-list-dialog')).toBeInTheDocument();
    });

    it('hides CreateListDialog when selectedBoardId is empty', () => {
      mockUseMyTasksState.mockReturnValue(
        createDefaultState({ selectedBoardId: '' })
      );

      render(<MyTasksContent wsId="ws-1" userId="user-1" isPersonal={false} />);
      expect(
        screen.queryByTestId('create-list-dialog')
      ).not.toBeInTheDocument();
    });
  });

  // ── Prop threading ───────────────────────────────────────────────────────
  describe('prop threading', () => {
    it('passes task counts from filteredTasks to MyTasksHeader', () => {
      mockUseMyTasksState.mockReturnValue(
        createDefaultState({
          filteredTasks: {
            overdueTasks: [{ id: '1' }, { id: '2' }],
            todayTasks: [{ id: '3' }],
            upcomingTasks: [{ id: '4' }, { id: '5' }, { id: '6' }],
          },
        })
      );

      render(<MyTasksContent wsId="ws-1" userId="user-1" isPersonal={false} />);

      const header = screen.getByTestId('my-tasks-header');
      const props = JSON.parse(header.dataset.props || '{}');

      expect(props.overdueCount).toBe(2);
      expect(props.todayCount).toBe(1);
      expect(props.upcomingCount).toBe(3);
    });

    it('passes combined loading state to CommandBar', () => {
      mockUseMyTasksState.mockReturnValue(
        createDefaultState({
          commandBarLoading: true,
          previewMutation: { isPending: false },
        })
      );

      render(<MyTasksContent wsId="ws-1" userId="user-1" isPersonal={false} />);

      const commandBar = screen.getByTestId('command-bar');
      expect(commandBar.dataset.loading).toBe('true');
    });

    it('passes previewMutation.isPending as loading to CommandBar', () => {
      mockUseMyTasksState.mockReturnValue(
        createDefaultState({
          commandBarLoading: false,
          previewMutation: { isPending: true },
        })
      );

      render(<MyTasksContent wsId="ws-1" userId="user-1" isPersonal={false} />);

      const commandBar = screen.getByTestId('command-bar');
      expect(commandBar.dataset.loading).toBe('true');
    });

    it('passes combined loading state to TaskList', () => {
      mockUseMyTasksState.mockReturnValue(
        createDefaultState({
          commandBarLoading: false,
          previewMutation: { isPending: true },
        })
      );

      render(<MyTasksContent wsId="ws-1" userId="user-1" isPersonal={false} />);

      const taskList = screen.getByTestId('task-list');
      expect(taskList.dataset.commandBarLoading).toBe('true');
    });
  });

  // ── useMyTasksState is called with correct props ─────────────────────────
  describe('hook invocation', () => {
    it('calls useMyTasksState with wsId, userId, and isPersonal', () => {
      render(<MyTasksContent wsId="ws-1" userId="user-1" isPersonal={true} />);

      expect(mockUseMyTasksState).toHaveBeenCalledWith({
        wsId: 'ws-1',
        userId: 'user-1',
        isPersonal: true,
      });
    });
  });
});
