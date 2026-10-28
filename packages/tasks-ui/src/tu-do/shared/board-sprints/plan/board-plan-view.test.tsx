import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { BoardSprint } from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardPlanView } from './board-plan-view';
import { getPlanMoveAssigneeIds } from './use-plan-assignment';

const api = vi.hoisted(() => ({
  createWorkspaceTask: vi.fn(),
  listBoardTasksForSearch: vi.fn(),
  moveTasks: vi.fn(),
  openTask: vi.fn(),
  start: vi.fn(),
  update: vi.fn(),
  updateSprint: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en-GB',
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${Object.values(values).join('/')}` : key,
}));

vi.mock('@tuturuuu/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuCheckboxItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <button onClick={() => onSelect?.()} role="menuitem" type="button">
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  createWorkspaceTask: api.createWorkspaceTask,
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
  updateWorkspaceTask: api.update,
}));

vi.mock('@tuturuuu/internal-api/task-sprints', () => ({
  listWorkspaceTaskBoardSprints: vi.fn(),
  moveTasksToWorkspaceTaskBoardSprint: api.moveTasks,
  startWorkspaceTaskBoardSprint: api.start,
  updateWorkspaceTaskBoardSprint: api.updateSprint,
  updateWorkspaceTaskBoardSprintLength: vi.fn(),
}));

vi.mock('../../board-task-search', () => ({
  listBoardTasksForSearch: api.listBoardTasksForSearch,
}));

vi.mock('../../../hooks/useTaskDialog', () => ({
  useTaskDialog: () => ({ openTask: api.openTask }),
}));

vi.mock('../../board-broadcast-context', () => ({
  useBoardBroadcast: () => null,
}));

const sprint = (
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

const task = (id: string, extra: Partial<Task> = {}): Task =>
  ({
    id,
    name: `Task ${id}`,
    list_id: 'list-todo',
    display_number: Number(id.replace(/\D/g, '')) || 1,
    assignees: [],
    ...extra,
  }) as Task;

const lists = [
  { id: 'list-todo', name: 'To Do', status: 'not_started' },
  { id: 'list-done', name: 'Done', status: 'done' },
] as TaskList[];

function sprintsState(sprints: BoardSprint[]) {
  const planningSprint = sprints.find((s) => s.status === 'planned') ?? null;
  const active = sprints.find((s) => s.status === 'active') ?? null;
  const current = active ?? planningSprint;
  return {
    currentSprint: current,
    currentSprintTaskIds: new Set(current?.tasks.map((t) => t.task_id)),
    showsOnBoard: null,
    isError: false,
    isLoading: false,
    openSprintByTaskId: new Map(),
    planningSprint,
    schemaAvailable: true,
    sprintLengthWeeks: 2 as const,
    sprints,
    sprintsOn: true,
  };
}

function renderPlan({
  canManage = true,
  sprints,
}: {
  canManage?: boolean;
  sprints: BoardSprint[];
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
        defaultListId="list-todo"
        lists={lists}
        sprints={sprintsState(sprints)}
        ticketPrefix="DEV"
        wsId="ws-1"
      />
    </QueryClientProvider>
  );
}

function dataTransfer() {
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
  api.update.mockResolvedValue({});
  api.listBoardTasksForSearch.mockResolvedValue([
    task('t1'),
    task('t2', { assignees: [{ id: 'u-ana', display_name: 'Ana' }] }),
    task('t3', { completed_at: '2026-11-03T00:00:00Z', list_id: 'list-done' }),
    task('t4'),
  ]);
});

describe('getPlanMoveAssigneeIds', () => {
  it('assigns from the backlog, swaps between people and clears into the backlog', () => {
    expect(getPlanMoveAssigneeIds([], { from: null, to: 'a' })).toEqual(['a']);
    expect(getPlanMoveAssigneeIds(['a', 'c'], { from: 'a', to: 'b' })).toEqual([
      'c',
      'b',
    ]);
    expect(getPlanMoveAssigneeIds(['a', 'c'], { from: 'a', to: null })).toEqual(
      []
    );
  });
});

describe('BoardPlanView', () => {
  const planned = sprint(15, 'planned', ['t1', 't2', 't3']);
  const active = sprint(14, 'active', ['t4']);

  it('shows unassigned open tasks of the sprint being planned as the backlog', async () => {
    renderPlan({ sprints: [planned] });
    const backlog = await screen.findByRole('region', { name: 'backlog' });
    await waitFor(() =>
      expect(
        within(backlog)
          .getAllByRole('article')
          .map((card) => card.getAttribute('data-plan-task-id'))
      ).toEqual(['t1'])
    );
    const ana = screen.getByRole('region', { name: 'Ana' });
    expect(within(ana).getByText('Task t2')).toBeInTheDocument();
    expect(screen.queryByText('Task t4')).not.toBeInTheDocument();
  });

  it('assigns a backlog task from its avatar button', async () => {
    renderPlan({ sprints: [planned] });
    fireEvent.click(
      await screen.findByRole('button', { name: 'assign:Task t1' })
    );
    fireEvent.click(screen.getAllByRole('menuitem', { name: /Binh/ })[0]!);
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('ws-1', 't1', {
        assignee_ids: ['u-binh'],
      })
    );
  });

  it('keeps a successful assignment when another one fails', async () => {
    let failFirst: (error: Error) => void = () => undefined;
    api.listBoardTasksForSearch.mockResolvedValue([task('t1'), task('t5')]);
    api.update.mockImplementation((_ws: string, id: string) => {
      if (id === 't1') {
        return new Promise((_resolve, reject) => {
          failFirst = reject;
        });
      }
      // The server now has t5 with Ana, which a later refetch must show.
      api.listBoardTasksForSearch.mockResolvedValue([
        task('t1'),
        task('t5', { assignees: [{ id: 'u-ana', display_name: 'Ana' }] }),
      ]);
      return Promise.resolve({});
    });
    renderPlan({ sprints: [sprint(15, 'planned', ['t1', 't5'])] });

    fireEvent.click(
      await screen.findByRole('button', { name: 'assign:Task t1' })
    );
    fireEvent.click(screen.getAllByRole('menuitem', { name: /Binh/ })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'assign:Task t5' }));
    fireEvent.click(screen.getAllByRole('menuitem', { name: /Ana/ }).at(-1)!);
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));

    failFirst(new Error('network'));

    const backlog = screen.getByRole('region', { name: 'backlog' });
    await waitFor(() =>
      expect(within(backlog).getByText('Task t1')).toBeInTheDocument()
    );
    expect(
      within(screen.getByRole('region', { name: 'Ana' })).getByText('Task t5')
    ).toBeInTheDocument();
  });

  it('rereads owners only after a slower move on another task succeeds', async () => {
    let failFirst: (error: Error) => void = () => undefined;
    let finishSecond: () => void = () => undefined;
    api.listBoardTasksForSearch.mockResolvedValue([task('t1'), task('t5')]);
    api.update.mockImplementation((_ws: string, id: string) =>
      id === 't1'
        ? new Promise((_resolve, reject) => {
            failFirst = reject;
          })
        : new Promise((resolve) => {
            finishSecond = () => {
              api.listBoardTasksForSearch.mockResolvedValue([
                task('t1'),
                task('t5', {
                  assignees: [{ id: 'u-ana', display_name: 'Ana' }],
                }),
              ]);
              resolve({});
            };
          })
    );
    renderPlan({ sprints: [sprint(15, 'planned', ['t1', 't5'])] });

    fireEvent.click(
      await screen.findByRole('button', { name: 'assign:Task t1' })
    );
    fireEvent.click(screen.getAllByRole('menuitem', { name: /Binh/ })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'assign:Task t5' }));
    fireEvent.click(screen.getAllByRole('menuitem', { name: /Ana/ }).at(-1)!);
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));
    const fetchesBefore = api.listBoardTasksForSearch.mock.calls.length;

    failFirst(new Error('network'));
    const backlog = screen.getByRole('region', { name: 'backlog' });
    await waitFor(() =>
      expect(within(backlog).getByText('Task t1')).toBeInTheDocument()
    );
    // t5 is still in flight, so no reread may overwrite its new owner.
    expect(api.listBoardTasksForSearch.mock.calls.length).toBe(fetchesBefore);
    const ana = screen.getByRole('region', { name: 'Ana' });
    expect(within(ana).getByText('Task t5')).toBeInTheDocument();

    finishSecond();
    await waitFor(() =>
      expect(api.listBoardTasksForSearch.mock.calls.length).toBeGreaterThan(
        fetchesBefore
      )
    );
    expect(
      within(screen.getByRole('region', { name: 'Ana' })).getByText('Task t5')
    ).toBeInTheDocument();
    expect(within(backlog).queryByText('Task t5')).toBeNull();
  });

  it('shows the server owners after two moves of one task both fail', async () => {
    const fails: Array<(error: Error) => void> = [];
    api.listBoardTasksForSearch.mockResolvedValue([task('t1')]);
    api.update.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fails.push(reject);
        })
    );
    renderPlan({ sprints: [sprint(15, 'planned', ['t1'])] });

    fireEvent.click(
      await screen.findByRole('button', { name: 'assign:Task t1' })
    );
    fireEvent.click(screen.getAllByRole('menuitem', { name: /Ana/ })[0]!);
    const row = (
      await within(screen.getByRole('region', { name: 'Ana' })).findByText(
        'Task t1'
      )
    ).closest('[draggable]')!;
    const transfer = dataTransfer();
    fireEvent.dragStart(row, { dataTransfer: transfer });
    const binh = screen.getByRole('region', { name: 'Binh' });
    fireEvent.dragOver(binh, { dataTransfer: transfer });
    fireEvent.drop(binh, { dataTransfer: transfer });
    // Moves of one task are sent one after another.
    await waitFor(() => expect(fails).toHaveLength(1));
    const fetchesBefore = api.listBoardTasksForSearch.mock.calls.length;
    fails[0]!(new Error('network'));
    await waitFor(() => expect(fails).toHaveLength(2));
    fails[1]!(new Error('network'));

    await waitFor(() =>
      expect(api.listBoardTasksForSearch.mock.calls.length).toBeGreaterThan(
        fetchesBefore
      )
    );
    const backlog = screen.getByRole('region', { name: 'backlog' });
    await waitFor(() =>
      expect(within(backlog).getByText('Task t1')).toBeInTheDocument()
    );
    expect(
      within(screen.getByRole('region', { name: 'Ana' })).queryByText('Task t1')
    ).toBeNull();
  });

  it('unassigns a task dropped back on the backlog', async () => {
    renderPlan({ sprints: [planned] });
    const row = (await screen.findByText('Task t2')).closest('[draggable]')!;
    const transfer = dataTransfer();
    fireEvent.dragStart(row, { dataTransfer: transfer });
    const backlog = screen.getByRole('region', { name: 'backlog' });
    fireEvent.dragOver(backlog, { dataTransfer: transfer });
    fireEvent.drop(backlog, { dataTransfer: transfer });
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('ws-1', 't2', {
        assignee_ids: [],
      })
    );
  });

  it('lets managers start the planned sprint only while none runs', async () => {
    api.start.mockResolvedValue({});
    const { unmount } = renderPlan({ sprints: [planned] });
    fireEvent.click(
      await screen.findByRole('button', { name: 'start:Sprint 15' })
    );
    await waitFor(() =>
      expect(api.start).toHaveBeenCalledWith('ws-1', 'board-1', 'sprint-15')
    );
    unmount();

    renderPlan({ canManage: false, sprints: [planned] });
    await screen.findByRole('region', { name: 'backlog' });
    expect(
      screen.queryByRole('button', { name: 'start:Sprint 15' })
    ).not.toBeInTheDocument();
  });

  it('saves the sprint goal when the field loses focus', async () => {
    api.updateSprint.mockResolvedValue({});
    renderPlan({ sprints: [planned] });
    const goal = await screen.findByRole('textbox', { name: 'goal' });
    fireEvent.change(goal, { target: { value: 'Ship sprint planning' } });
    fireEvent.blur(goal);
    await waitFor(() =>
      expect(api.updateSprint).toHaveBeenCalledWith(
        'ws-1',
        'board-1',
        'sprint-15',
        { goal: 'Ship sprint planning' }
      )
    );
  });

  it('adds new backlog tasks to the planned sprint while another runs', async () => {
    api.createWorkspaceTask.mockResolvedValue({ task: task('t9') });
    api.moveTasks.mockResolvedValue({ moved: 1 });
    renderPlan({ sprints: [active, planned] });
    fireEvent.click(
      await screen.findByRole('button', { name: 'add_to_backlog' })
    );
    const input = screen.getByRole('textbox', { name: 'new_backlog_task' });
    fireEvent.change(input, { target: { value: 'Write release notes' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(api.moveTasks).toHaveBeenCalledWith(
        'ws-1',
        'board-1',
        'sprint-15',
        ['t9']
      )
    );
    expect(api.createWorkspaceTask).toHaveBeenCalledWith('ws-1', {
      listId: 'list-todo',
      name: 'Write release notes',
    });
  });

  it.each([
    ['moves it to the trash and keeps the name', true],
    ['reports it and clears the name when the trash fails too', false],
  ])(
    'when a new task cannot reach the backlog, %s',
    async (_label, trashWorks) => {
      api.createWorkspaceTask.mockResolvedValue({ task: task('t9') });
      api.moveTasks.mockRejectedValue(new Error('network'));
      api.update.mockImplementation(async () => {
        if (!trashWorks) throw new Error('network');
        return {};
      });
      renderPlan({ sprints: [active, planned] });
      fireEvent.click(
        await screen.findByRole('button', { name: 'add_to_backlog' })
      );
      const input = screen.getByRole('textbox', { name: 'new_backlog_task' });
      fireEvent.change(input, { target: { value: 'Write release notes' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() =>
        expect(api.update).toHaveBeenCalledWith('ws-1', 't9', {
          deleted: true,
        })
      );
      // One retry before giving up.
      expect(api.moveTasks).toHaveBeenCalledTimes(2);
      await waitFor(() =>
        expect(input).toHaveValue(trashWorks ? 'Write release notes' : '')
      );
    }
  );

  it('loads tasks in Review lists too, so the plan and summary see them', async () => {
    api.listBoardTasksForSearch.mockResolvedValue([]);
    renderPlan({ sprints: [planned] });
    await waitFor(() =>
      expect(api.listBoardTasksForSearch).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          listStatuses: expect.arrayContaining(['review']),
        })
      )
    );
  });
});
