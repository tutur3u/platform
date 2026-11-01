import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { describe, expect, it } from 'vitest';
import {
  api,
  assignFromBacklog,
  dataTransfer,
  renderPlan,
  sprint,
  task,
} from './board-plan-view.fixtures';
import { getPlanMoveAssigneeIds } from './use-plan-assignment';

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

  it('labels tasks with their first project key, and nothing without one', async () => {
    api.listBoardTasksForSearch.mockResolvedValue([
      task('t1', {
        projects: [
          {
            id: 'p-2',
            name: 'Mobile',
            status: 'active',
            ticket_key: 'MOB',
            ticket_number: 3,
            created_at: '2026-10-21T00:00:00Z',
          },
          {
            id: 'p-1',
            name: 'Platform',
            status: 'active',
            ticket_key: 'PLA',
            ticket_number: 12,
            created_at: '2026-10-20T00:00:00Z',
          },
        ],
        assignees: [{ id: 'u-binh', display_name: 'Binh' }],
      } as Partial<Task>),
      task('t2', { assignees: [{ id: 'u-ana', display_name: 'Ana' }] }),
    ]);
    renderPlan({ sprints: [planned] });

    const binh = await screen.findByRole('region', { name: 'Binh' });
    expect(await within(binh).findByText('[PLA-12]')).toBeInTheDocument();
    const ana = screen.getByRole('region', { name: 'Ana' });
    expect(within(ana).getByText('Task t2').textContent).toBe('Task t2');
  });

  it('assigns a backlog task dragged onto a person', async () => {
    renderPlan({ sprints: [planned] });
    await assignFromBacklog('t1', 'Binh');
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

    await assignFromBacklog('t1', 'Binh');
    await assignFromBacklog('t5', 'Ana');
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

    await assignFromBacklog('t1', 'Binh');
    await assignFromBacklog('t5', 'Ana');
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

    await assignFromBacklog('t1', 'Ana');
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

  it('opens a planned task when its row is clicked', async () => {
    api.listBoardTasksForSearch.mockResolvedValue([
      task('t2', { assignees: [{ id: 'u-ana', display_name: 'Ana' }] }),
    ]);
    renderPlan({ sprints: [planned] });
    const ana = await screen.findByRole('region', { name: 'Ana' });
    fireEvent.click(
      await within(ana).findByRole('button', { name: 'open_task:Task t2' })
    );
    expect(api.openTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't2' }),
      'board-1',
      expect.anything(),
      false,
      { taskWsId: 'ws-1' }
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

  it('creates backlog tasks in an open list when the default list is Done', async () => {
    api.createWorkspaceTask.mockResolvedValue({ task: task('t9') });
    api.moveTasks.mockResolvedValue({ moved: 1 });
    renderPlan({ defaultListId: 'list-done', sprints: [active, planned] });
    fireEvent.click(
      await screen.findByRole('button', { name: 'add_to_backlog' })
    );
    const input = screen.getByRole('textbox', { name: 'new_backlog_task' });
    fireEvent.change(input, { target: { value: 'Write release notes' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(api.createWorkspaceTask).toHaveBeenCalledWith('ws-1', {
        listId: 'list-todo',
        name: 'Write release notes',
      })
    );
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
