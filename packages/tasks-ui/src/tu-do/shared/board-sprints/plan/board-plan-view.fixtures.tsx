import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { BoardSprint } from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type React from 'react';
import { beforeEach, vi } from 'vitest';
import { BoardPlanView } from './board-plan-view';

// Shared by the Plan view tests: API doubles, menus rendered inline, and a
// render helper over a board's sprints.
const mocks = vi.hoisted(() => ({
  addSprint: vi.fn(),
  createWorkspaceTask: vi.fn(),
  listBoardTasksForSearch: vi.fn(),
  moveTasks: vi.fn(),
  openTask: vi.fn(),
  removeSprint: vi.fn(),
  start: vi.fn(),
  toastError: vi.fn(),
  unplan: vi.fn(),
  update: vi.fn(),
}));

// The Board's card has its own tests; here it only needs to show the task.
vi.mock('../../../boards/boardId/task-card/task-card', () => ({
  TaskCard: ({ task }: { task: Task }) => <p>{task.name}</p>,
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en-GB',
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${Object.values(values).join('/')}` : key,
}));

vi.mock('@tuturuuu/ui/dropdown-menu', async () => {
  const { createContext, useContext } = await import('react');
  const Radio = createContext<(value: string) => void>(() => undefined);
  return {
    DropdownMenu: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownMenuRadioGroup: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange: (value: string) => void;
    }) => <Radio.Provider value={onValueChange}>{children}</Radio.Provider>,
    DropdownMenuRadioItem: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value: string;
    }) => {
      const select = useContext(Radio);
      return (
        <button
          aria-checked={false}
          onClick={() => select(value)}
          role="menuitemradio"
          type="button"
        >
          {children}
        </button>
      );
    },
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuCheckboxItem: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
      <div role="menu">{children}</div>
    ),
    DropdownMenuItem: ({
      children,
      disabled,
      onSelect,
    }: {
      children: React.ReactNode;
      disabled?: boolean;
      onSelect?: () => void;
    }) => (
      <button
        disabled={disabled}
        onClick={() => onSelect?.()}
        role="menuitem"
        type="button"
      >
        {children}
      </button>
    ),
    DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownMenuSub: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => (
      <div role="menu">{children}</div>
    ),
    DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
  };
});

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: mocks.toastError, success: vi.fn() },
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  createWorkspaceTask: mocks.createWorkspaceTask,
  listWorkspaceTaskBoardViewableMembers: async () => ({
    members: [
      { user_id: 'u-ana', display_name: 'Ana', email: null, avatar_url: null },
      {
        user_id: 'u-binh',
        display_name: 'Binh',
        email: null,
        avatar_url: null,
      },
    ],
  }),
  listWorkspaceTaskProjects: async () => [],
  updateWorkspaceTask: mocks.update,
}));

vi.mock('@tuturuuu/internal-api/task-sprints', () => ({
  MAX_OPEN_BOARD_SPRINTS: 5,
  addWorkspaceTaskBoardSprint: mocks.addSprint,
  listWorkspaceTaskBoardSprints: vi.fn(),
  moveTasksOutOfWorkspaceTaskBoardSprints: mocks.unplan,
  removeWorkspaceTaskBoardSprint: mocks.removeSprint,
  moveTasksToWorkspaceTaskBoardSprint: mocks.moveTasks,
  startWorkspaceTaskBoardSprint: mocks.start,
  updateWorkspaceTaskBoardSprintLength: vi.fn(),
}));

vi.mock('../../board-task-search', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../board-task-search')>()),
  listBoardTasksForSearch: mocks.listBoardTasksForSearch,
}));

vi.mock('../../../hooks/useTaskDialog', () => ({
  useTaskDialog: () => ({ openTask: mocks.openTask }),
}));

vi.mock('../../board-broadcast-context', () => ({
  useBoardBroadcast: () => null,
}));

export const sprint = (
  sequence: number,
  status: BoardSprint['status'],
  taskIds: string[]
): BoardSprint => ({
  id: `sprint-${sequence}`,
  name: `Sprint ${sequence}`,
  sequence_number: sequence,
  status,
  start_date: '2026-11-02',
  end_date: '2026-11-13',
  goal: null,
  goal_result: null,
  started_at: null,
  ended_at: null,
  tasks: taskIds.map((task_id) => ({
    task_id,
    added_after_start: false,
    carry_count: 0,
    end_decision: null,
  })),
  report: null,
});

export const task = (id: string, extra: Partial<Task> = {}): Task =>
  ({
    id,
    name: `Task ${id}`,
    list_id: 'list-todo',
    display_number: Number(id.replace(/\D/g, '')) || 1,
    assignees: [],
    ...extra,
  }) as Task;

export const lists = [
  { id: 'list-todo', name: 'To Do', status: 'not_started' },
  { id: 'list-done', name: 'Done', status: 'done' },
] as TaskList[];

export function sprintsState(sprints: BoardSprint[], unplanned: string[] = []) {
  const planningSprint = sprints.find((s) => s.status === 'planned') ?? null;
  const active = sprints.find((s) => s.status === 'active') ?? null;
  const current = active ?? planningSprint;
  return {
    currentSprint: current,
    currentSprintTaskIds: new Set(current?.tasks.map((t) => t.task_id)),
    showsOnBoard: null,
    isError: false,
    isLoading: false,
    openSprintByTaskId: new Map(
      sprints
        .filter((s) => s.status !== 'completed')
        .flatMap((s) => s.tasks.map((t) => [t.task_id, s] as const))
    ),
    planningSprint,
    schemaAvailable: true,
    sprintLengthWeeks: 2 as const,
    sprints,
    sprintsOn: true,
    unplannedTaskIds: new Set(unplanned),
  };
}

export function renderPlan({
  canManage = true,
  defaultListId = 'list-todo',
  searchQuery,
  sprints,
  unplanned,
}: {
  canManage?: boolean;
  defaultListId?: string;
  searchQuery?: string;
  sprints: BoardSprint[];
  unplanned?: string[];
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BoardPlanView
        boardId="board-1"
        canManage={canManage}
        canPlan
        defaultListId={defaultListId}
        lists={lists}
        searchQuery={searchQuery}
        sprints={sprintsState(sprints, unplanned)}
        wsId="ws-1"
      />
    </QueryClientProvider>
  );
}

export function dataTransfer() {
  const store = new Map<string, string>();
  return {
    dropEffect: 'none',
    effectAllowed: 'all',
    getData: (type: string) => store.get(type) ?? '',
    setData: (type: string, value: string) => store.set(type, value),
    get types() {
      return [...store.keys()];
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue({});
  mocks.listBoardTasksForSearch.mockResolvedValue([
    task('t1'),
    task('t2', { assignees: [{ id: 'u-ana', display_name: 'Ana' }] }),
    task('t3', { completed_at: '2026-11-03T00:00:00Z', list_id: 'list-done' }),
    task('t4'),
  ]);
});

/** The API doubles the mocked modules call. */
export const api = mocks;

/** Drags a backlog card onto a person, as planning does. */
export async function assignFromBacklog(taskId: string, person: string) {
  const card = await screen.findByRole('article', { name: `Task ${taskId}` });
  const transfer = dataTransfer();
  const target = screen.getByRole('region', { name: person });
  fireEvent.dragStart(card, { dataTransfer: transfer });
  fireEvent.dragOver(target, { dataTransfer: transfer });
  fireEvent.drop(target, { dataTransfer: transfer });
}
