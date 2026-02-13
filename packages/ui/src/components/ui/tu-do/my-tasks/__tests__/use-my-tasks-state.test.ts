import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────
const {
  mockInvalidateQueries,
  mockUseQuery,
  mockUseMutation,
  mockUseInfiniteQuery,
  mockFrom,
  mockSelect,
  mockInsert,
  mockEq,
  mockIs,
  mockOrder,
  mockIn,
  mockT,
  mockToastError,
  mockToastSuccess,
  mockOnUpdate,
  mockOpenTaskById,
  mockCreateTaskFn,
  mockFetch,
} = vi.hoisted(() => ({
  mockInvalidateQueries: vi.fn(),
  mockUseQuery: vi.fn(),
  mockUseMutation: vi.fn(),
  mockUseInfiniteQuery: vi.fn(),
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockEq: vi.fn(),
  mockIs: vi.fn(),
  mockOrder: vi.fn(),
  mockIn: vi.fn(),
  mockT: vi.fn((key: string) => key),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockOnUpdate: vi.fn(() => vi.fn()), // returns cleanup fn
  mockOpenTaskById: vi.fn(),
  mockCreateTaskFn: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useInfiniteQuery: (...args: unknown[]) => mockUseInfiniteQuery(...args),
  keepPreviousData: Symbol('keepPreviousData'),
}));

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => ({
    from: mockFrom,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => mockT,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));

vi.mock('@tuturuuu/ui/tu-do/hooks/useTaskDialog', () => ({
  useTaskDialog: () => ({
    onUpdate: mockOnUpdate,
    openTaskById: mockOpenTaskById,
  }),
}));

vi.mock('@tuturuuu/utils/task-helper', () => ({
  createTask: mockCreateTaskFn,
  useBoardConfig: () => ({ data: null }),
}));

global.fetch = mockFetch;

// ── Import after mocks ─────────────────────────────────────────────────────
import { useMyTasksState } from '../use-my-tasks-state';

// ── Helpers ────────────────────────────────────────────────────────────────
const DEFAULT_PROPS = {
  wsId: 'ws-1',
  userId: 'user-1',
  isPersonal: false,
};

/** Default mock setup — all queries return empty/loading state */
function setupDefaultMocks() {
  // useMyTasksQuery internally calls useQuery
  // useCompletedTasksQuery internally calls useInfiniteQuery
  // The hook also calls useQuery ~6 more times for workspaces, boards, labels, etc.
  // We use mockImplementation to route by queryKey.

  mockUseQuery.mockImplementation((opts: Record<string, any>) => {
    const key = opts?.queryKey?.[0];
    if (key === 'my-tasks') {
      return {
        data: {
          overdue: [],
          today: [],
          upcoming: [],
          completed: [],
          totalActiveTasks: 0,
          totalCompletedTasks: 0,
          hasMoreCompleted: false,
          completedPage: 0,
        },
        isLoading: false,
      };
    }
    // workspaces, boards, labels, projects, members, board-config
    return { data: undefined, isLoading: false };
  });

  mockUseInfiniteQuery.mockReturnValue({
    data: { pages: [] },
    isLoading: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
  });

  // useMutation is called twice: previewMutation, createTasksMutation
  mockUseMutation.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  });
}

function setupSupabaseMocks() {
  mockEq.mockResolvedValue({ data: null, error: null });
  mockIs.mockReturnValue({ order: mockOrder });
  mockOrder.mockResolvedValue({ data: [], error: null });
  mockIn.mockReturnValue({ is: mockIs, order: mockOrder });
  mockSelect.mockReturnValue({ eq: mockEq, in: mockIn });
  mockInsert.mockResolvedValue({ data: null, error: null });
  mockFrom.mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
  });
}

// ════════════════════════════════════════════════════════════════════════════
describe('useMyTasksState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    setupSupabaseMocks();
  });

  // ── Initial state ────────────────────────────────────────────────────────
  describe('initial state', () => {
    it('has all sections collapsed by default', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      expect(result.current.collapsedSections).toEqual({
        overdue: true,
        today: true,
        upcoming: true,
        completed: true,
      });
    });

    it('has empty command bar state', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      expect(result.current.commandBarInput).toBe('');
      expect(result.current.commandBarLoading).toBe(false);
    });

    it('has default filter state', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      expect(result.current.taskFilters).toEqual({
        workspaceIds: ['all'],
        boardIds: ['all'],
        labelIds: [],
        projectIds: [],
        selfManagedOnly: false,
      });
    });

    it('has AI settings all true by default', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      expect(result.current.aiGenerateDescriptions).toBe(true);
      expect(result.current.aiGeneratePriority).toBe(true);
      expect(result.current.aiGenerateLabels).toBe(true);
    });

    it('has autoAssignToMe true by default', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      expect(result.current.autoAssignToMe).toBe(true);
    });

    it('has taskCreatorMode null initially', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      expect(result.current.taskCreatorMode).toBeNull();
    });

    it('has board selector closed initially', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      expect(result.current.boardSelectorOpen).toBe(false);
    });

    it('has AI flow step idle', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      expect(result.current.aiFlowStep).toBe('idle');
    });
  });

  // ── toggleSection ────────────────────────────────────────────────────────
  describe('toggleSection', () => {
    it('toggles a section from collapsed to expanded', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.toggleSection('today');
      });

      expect(result.current.collapsedSections.today).toBe(false);
      // Other sections remain unchanged
      expect(result.current.collapsedSections.overdue).toBe(true);
      expect(result.current.collapsedSections.upcoming).toBe(true);
      expect(result.current.collapsedSections.completed).toBe(true);
    });

    it('toggles a section back to collapsed', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.toggleSection('today');
      });
      act(() => {
        result.current.toggleSection('today');
      });

      expect(result.current.collapsedSections.today).toBe(true);
    });

    it('toggles sections independently', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.toggleSection('overdue');
      });
      act(() => {
        result.current.toggleSection('completed');
      });

      expect(result.current.collapsedSections.overdue).toBe(false);
      expect(result.current.collapsedSections.completed).toBe(false);
      expect(result.current.collapsedSections.today).toBe(true);
      expect(result.current.collapsedSections.upcoming).toBe(true);
    });
  });

  // ── handleClearDestination ───────────────────────────────────────────────
  describe('handleClearDestination', () => {
    it('resets board/list/title/mode', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      // Set some state first
      act(() => {
        result.current.setSelectedBoardId('board-1');
        result.current.setSelectedListId('list-1');
        result.current.setPendingTaskTitle('Some task');
        result.current.setTaskCreatorMode('simple');
      });

      act(() => {
        result.current.handleClearDestination();
      });

      expect(result.current.selectedBoardId).toBe('');
      expect(result.current.selectedListId).toBe('');
      expect(result.current.pendingTaskTitle).toBe('');
      expect(result.current.taskCreatorMode).toBeNull();
    });
  });

  // ── Filter handlers ──────────────────────────────────────────────────────
  describe('filter handlers', () => {
    it('handleFilterChange merges partial filter updates', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.handleFilterChange({ selfManagedOnly: true });
      });

      expect(result.current.taskFilters.selfManagedOnly).toBe(true);
      // Other filters remain default
      expect(result.current.taskFilters.workspaceIds).toEqual(['all']);
    });

    it('handleFilterChange can update multiple fields', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.handleFilterChange({
          workspaceIds: ['ws-a'],
          boardIds: ['board-1'],
        });
      });

      expect(result.current.taskFilters.workspaceIds).toEqual(['ws-a']);
      expect(result.current.taskFilters.boardIds).toEqual(['board-1']);
    });

    it('handleLabelFilterChange updates labelIds', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.handleLabelFilterChange(['label-1', 'label-2']);
      });

      expect(result.current.taskFilters.labelIds).toEqual([
        'label-1',
        'label-2',
      ]);
    });

    it('handleProjectFilterChange updates projectIds', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.handleProjectFilterChange(['proj-1']);
      });

      expect(result.current.taskFilters.projectIds).toEqual(['proj-1']);
    });
  });

  // ── handleUpdate ─────────────────────────────────────────────────────────
  describe('handleUpdate', () => {
    it('invalidates 4 correct query keys', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.handleUpdate();
      });

      expect(mockInvalidateQueries).toHaveBeenCalledTimes(4);
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['my-tasks', 'ws-1', false],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['my-completed-tasks', 'ws-1', false],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['user-workspaces'],
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['workspace', 'ws-1'],
      });
    });
  });

  // ── handleGenerateAI ─────────────────────────────────────────────────────
  describe('handleGenerateAI', () => {
    it('rejects empty entry with toast error', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.handleGenerateAI('');
      });

      expect(mockToastError).toHaveBeenCalledWith(
        'ws-tasks.errors.missing_task_description'
      );
    });

    it('rejects whitespace-only entry with toast error', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.handleGenerateAI('   ');
      });

      expect(mockToastError).toHaveBeenCalledWith(
        'ws-tasks.errors.missing_task_description'
      );
    });

    it('sets taskCreatorMode to "ai" and pendingTaskTitle', () => {
      // Track the last useMutation call to capture mutate
      const mockMutate = vi.fn();
      mockUseMutation.mockReturnValue({
        mutate: mockMutate,
        mutateAsync: vi.fn(),
        isPending: false,
      });

      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.handleGenerateAI('Build a landing page');
      });

      expect(result.current.taskCreatorMode).toBe('ai');
      expect(result.current.pendingTaskTitle).toBe('Build a landing page');
    });

    it('calls previewMutation.mutate with correct params', () => {
      const mockMutate = vi.fn();
      mockUseMutation.mockReturnValue({
        mutate: mockMutate,
        mutateAsync: vi.fn(),
        isPending: false,
      });

      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.handleGenerateAI('Build a landing page');
      });

      // previewMutation is the first useMutation call
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          entry: 'Build a landing page',
          generateDescriptions: true,
          generatePriority: true,
          generateLabels: true,
          clientTimezone: expect.any(String),
          clientTimestamp: expect.any(String),
        })
      );
    });
  });

  // ── handleConfirmReview ──────────────────────────────────────────────────
  describe('handleConfirmReview', () => {
    it('stores confirmed tasks, closes preview, opens board selector', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      const tasks = [
        {
          title: 'Task 1',
          description: 'Desc 1',
          priority: 'high' as const,
          labels: [],
          dueDate: null,
        },
      ];

      act(() => {
        result.current.handleConfirmReview(tasks);
      });

      expect(result.current.confirmedTasks).toEqual(tasks);
      expect(result.current.previewOpen).toBe(false);
      expect(result.current.aiFlowStep).toBe('selecting-destination');
      expect(result.current.boardSelectorOpen).toBe(true);
    });
  });

  // ── handleCreateTask ─────────────────────────────────────────────────────
  describe('handleCreateTask', () => {
    it('opens board selector when no destination is set', async () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.handleCreateTask('New task');
      });

      expect(success).toBe(false);
      expect(result.current.boardSelectorOpen).toBe(true);
      expect(result.current.pendingTaskTitle).toBe('New task');
    });

    it('creates task via Supabase when destination is set', async () => {
      mockCreateTaskFn.mockResolvedValue({ id: 'new-task-1' });

      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      // Set destination first
      act(() => {
        result.current.setSelectedBoardId('board-1');
        result.current.setSelectedListId('list-1');
      });

      await act(async () => {
        await result.current.handleCreateTask('New task');
      });

      expect(mockCreateTaskFn).toHaveBeenCalledWith(
        expect.anything(), // supabase client
        'list-1',
        expect.objectContaining({ name: 'New task' })
      );
    });

    it('inserts assignee (auto-assign to me) after task creation', async () => {
      mockCreateTaskFn.mockResolvedValue({ id: 'new-task-1' });
      mockInsert.mockResolvedValue({ data: null, error: null });

      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.setSelectedBoardId('board-1');
        result.current.setSelectedListId('list-1');
      });

      await act(async () => {
        await result.current.handleCreateTask('New task');
      });

      // Should have been called with task_assignees insert for auto-assign
      expect(mockFrom).toHaveBeenCalledWith('task_assignees');
    });

    it('auto-assign deduplicates when userId is already in assigneeIds', async () => {
      mockCreateTaskFn.mockResolvedValue({ id: 'new-task-1' });
      mockInsert.mockResolvedValue({ data: null, error: null });

      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.setSelectedBoardId('board-1');
        result.current.setSelectedListId('list-1');
      });

      await act(async () => {
        await result.current.handleCreateTask('Task', {
          assigneeIds: ['user-1'], // same as userId
        });
      });

      // The mergedAssigneeIds uses Set, so user-1 should only appear once
      const insertCalls = mockInsert.mock.calls;
      const assigneeInsert = insertCalls.find((call: any[]) => {
        const arg = call[0];
        return Array.isArray(arg) && arg[0]?.user_id;
      });

      if (assigneeInsert) {
        const assigneeData = assigneeInsert[0] as Array<{
          task_id: string;
          user_id: string;
        }>;
        const userIds = assigneeData.map((a) => a.user_id);
        // No duplicates
        expect(new Set(userIds).size).toBe(userIds.length);
      }
    });

    it('clears input on success and calls handleUpdate', async () => {
      mockCreateTaskFn.mockResolvedValue({ id: 'new-task-1' });

      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.setSelectedBoardId('board-1');
        result.current.setSelectedListId('list-1');
        result.current.setCommandBarInput('Some input');
      });

      await act(async () => {
        await result.current.handleCreateTask('New task');
      });

      expect(result.current.commandBarInput).toBe('');
      expect(result.current.pendingTaskTitle).toBe('');
      expect(mockToastSuccess).toHaveBeenCalled();
      expect(mockInvalidateQueries).toHaveBeenCalled();
    });

    it('shows toast error on failure', async () => {
      mockCreateTaskFn.mockRejectedValue(new Error('DB error'));

      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.setSelectedBoardId('board-1');
        result.current.setSelectedListId('list-1');
      });

      await act(async () => {
        await result.current.handleCreateTask('Fail task');
      });

      expect(mockToastError).toHaveBeenCalledWith('DB error');
    });

    it('inserts labels when options.labelIds provided', async () => {
      mockCreateTaskFn.mockResolvedValue({ id: 'new-task-1' });
      mockInsert.mockResolvedValue({ data: null, error: null });

      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.setSelectedBoardId('board-1');
        result.current.setSelectedListId('list-1');
      });

      await act(async () => {
        await result.current.handleCreateTask('Task', {
          labelIds: ['label-a', 'label-b'],
        });
      });

      expect(mockFrom).toHaveBeenCalledWith('task_labels');
    });

    it('inserts projects when options.projectIds provided', async () => {
      mockCreateTaskFn.mockResolvedValue({ id: 'new-task-1' });
      mockInsert.mockResolvedValue({ data: null, error: null });

      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.setSelectedBoardId('board-1');
        result.current.setSelectedListId('list-1');
      });

      await act(async () => {
        await result.current.handleCreateTask('Task', {
          projectIds: ['proj-1'],
        });
      });

      expect(mockFrom).toHaveBeenCalledWith('task_project_tasks');
    });
  });

  // ── handleBoardSelectorConfirm ───────────────────────────────────────────
  describe('handleBoardSelectorConfirm', () => {
    it('closes board selector', async () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.setBoardSelectorOpen(true);
      });

      await act(async () => {
        await result.current.handleBoardSelectorConfirm();
      });

      expect(result.current.boardSelectorOpen).toBe(false);
    });

    it('routes to createTasksMutation in AI flow with confirmed tasks', async () => {
      const mockMutate = vi.fn();
      mockUseMutation.mockReturnValue({
        mutate: mockMutate,
        mutateAsync: vi.fn(),
        isPending: false,
      });

      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      // Simulate AI flow: confirm review first to set confirmedTasks and aiFlowStep
      const tasks = [
        {
          title: 'AI Task',
          description: null,
          priority: null as any,
          labels: [],
          dueDate: null,
        },
      ];

      act(() => {
        result.current.handleConfirmReview(tasks);
        result.current.setSelectedListId('list-1');
      });

      await act(async () => {
        await result.current.handleBoardSelectorConfirm();
      });

      // createTasksMutation.mutate should have been called
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          listId: 'list-1',
          tasks,
        })
      );
    });

    it('routes to handleGenerateAI for AI mode with pending title', async () => {
      const mockMutate = vi.fn();
      mockUseMutation.mockReturnValue({
        mutate: mockMutate,
        mutateAsync: vi.fn(),
        isPending: false,
      });

      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.setPendingTaskTitle('Generate tasks');
        result.current.setTaskCreatorMode('ai');
      });

      await act(async () => {
        await result.current.handleBoardSelectorConfirm();
      });

      // Should call previewMutation.mutate (handleGenerateAI path)
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          entry: 'Generate tasks',
        })
      );
    });

    it('routes to handleCreateTask for simple mode', async () => {
      mockCreateTaskFn.mockResolvedValue({ id: 'task-new' });

      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.setPendingTaskTitle('Simple task');
        result.current.setTaskCreatorMode('simple');
        result.current.setSelectedBoardId('board-1');
        result.current.setSelectedListId('list-1');
      });

      await act(async () => {
        await result.current.handleBoardSelectorConfirm();
      });

      expect(mockCreateTaskFn).toHaveBeenCalled();
    });
  });

  // ── handleCreateNewLabel ─────────────────────────────────────────────────
  describe('handleCreateNewLabel', () => {
    it('does nothing on empty name', async () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.setNewLabelName('');
      });

      await act(async () => {
        await result.current.handleCreateNewLabel();
      });

      expect(mockFrom).not.toHaveBeenCalledWith('workspace_task_labels');
    });

    it('inserts label, invalidates cache, shows toast, closes dialog', async () => {
      mockInsert.mockResolvedValue({ data: null, error: null });

      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.setNewLabelName('Bug');
        result.current.setNewLabelColor('#ff0000');
        result.current.setNewLabelDialogOpen(true);
      });

      await act(async () => {
        await result.current.handleCreateNewLabel();
      });

      expect(mockFrom).toHaveBeenCalledWith('workspace_task_labels');
      expect(mockInsert).toHaveBeenCalledWith({
        ws_id: 'ws-1',
        name: 'Bug',
        color: '#ff0000',
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['workspace', 'ws-1', 'labels'],
      });
      expect(mockToastSuccess).toHaveBeenCalledWith(
        'Label created successfully!'
      );
      expect(result.current.newLabelDialogOpen).toBe(false);
      expect(result.current.newLabelName).toBe('');
      expect(result.current.newLabelColor).toBe('#3b82f6'); // reset to default
    });

    it('shows error toast on failure', async () => {
      mockInsert.mockResolvedValue({
        data: null,
        error: { message: 'Duplicate label' },
      });
      // Make the from() chain throw properly
      mockFrom.mockImplementation((table: string) => {
        if (table === 'workspace_task_labels') {
          return {
            insert: () => {
              throw new Error('Duplicate label');
            },
          };
        }
        return { select: mockSelect, insert: mockInsert };
      });

      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.setNewLabelName('Duplicate');
      });

      await act(async () => {
        await result.current.handleCreateNewLabel();
      });

      expect(mockToastError).toHaveBeenCalledWith('Duplicate label');
    });
  });

  // ── handleCreateNewProject ───────────────────────────────────────────────
  describe('handleCreateNewProject', () => {
    it('does nothing on empty name', async () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.setNewProjectName('');
      });

      await act(async () => {
        await result.current.handleCreateNewProject();
      });

      expect(mockFrom).not.toHaveBeenCalledWith('task_projects');
    });

    it('inserts project, invalidates cache, shows toast, closes dialog', async () => {
      mockInsert.mockResolvedValue({ data: null, error: null });

      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.setNewProjectName('New Project');
        result.current.setNewProjectDialogOpen(true);
      });

      await act(async () => {
        await result.current.handleCreateNewProject();
      });

      expect(mockFrom).toHaveBeenCalledWith('task_projects');
      expect(mockInsert).toHaveBeenCalledWith({
        ws_id: 'ws-1',
        name: 'New Project',
      });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['workspace', 'ws-1', 'projects'],
      });
      expect(mockToastSuccess).toHaveBeenCalledWith(
        'Project created successfully!'
      );
      expect(result.current.newProjectDialogOpen).toBe(false);
      expect(result.current.newProjectName).toBe('');
    });

    it('shows error toast on failure', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'task_projects') {
          return {
            insert: () => {
              throw new Error('Insert failed');
            },
          };
        }
        return { select: mockSelect, insert: mockInsert };
      });

      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      act(() => {
        result.current.setNewProjectName('Fail Project');
      });

      await act(async () => {
        await result.current.handleCreateNewProject();
      });

      expect(mockToastError).toHaveBeenCalledWith('Insert failed');
    });
  });

  // ── selectedDestination memo ─────────────────────────────────────────────
  describe('selectedDestination memo', () => {
    it('returns null when no board or list selected', () => {
      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      expect(result.current.selectedDestination).toBeNull();
    });
  });

  // ── filteredTasks memo ───────────────────────────────────────────────────
  describe('filteredTasks memo', () => {
    it('passes through query data', () => {
      const mockOverdue = [{ id: 't1', name: 'Overdue' }];
      const mockToday = [{ id: 't2', name: 'Today' }];

      mockUseQuery.mockImplementation((opts: Record<string, any>) => {
        if (opts?.queryKey?.[0] === 'my-tasks') {
          return {
            data: {
              overdue: mockOverdue,
              today: mockToday,
              upcoming: [],
              totalActiveTasks: 2,
            },
            isLoading: false,
          };
        }
        return { data: undefined, isLoading: false };
      });

      const { result } = renderHook(() => useMyTasksState(DEFAULT_PROPS));

      expect(result.current.filteredTasks.overdueTasks).toEqual(mockOverdue);
      expect(result.current.filteredTasks.todayTasks).toEqual(mockToday);
      expect(result.current.filteredTasks.upcomingTasks).toEqual([]);
    });
  });

  // ── onUpdate subscription ────────────────────────────────────────────────
  describe('onUpdate subscription', () => {
    it('registers onUpdate callback on mount', () => {
      renderHook(() => useMyTasksState(DEFAULT_PROPS));

      expect(mockOnUpdate).toHaveBeenCalledWith(expect.any(Function));
    });
  });
});
