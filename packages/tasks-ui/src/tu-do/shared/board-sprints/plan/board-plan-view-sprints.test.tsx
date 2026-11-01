import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  api,
  assignFromBacklog,
  renderPlan,
  sprint,
  task,
} from './board-plan-view.fixtures';

describe('BoardPlanView sprints', () => {
  const planned = sprint(15, 'planned', ['t1', 't2', 't3']);
  const active = sprint(14, 'active', ['t4']);

  const backlogIds = async () => {
    const backlog = await screen.findByRole('region', { name: 'backlog' });
    return within(backlog)
      .getAllByRole('article')
      .map((card) => card.getAttribute('data-plan-task-id'));
  };
  const card = (id: string) =>
    screen.getByRole('article', { name: `Task ${id}` });

  it('shows open tasks in no sprint as ghosts in the backlog', async () => {
    renderPlan({ sprints: [planned], unplanned: ['t4'] });
    await waitFor(async () => expect(await backlogIds()).toEqual(['t1', 't4']));
    expect(card('t4')).toHaveAttribute('data-plan-ghost', 'true');
    expect(card('t1')).not.toHaveAttribute('data-plan-ghost');
    // Only tasks in the shown sprint take an owner from the card itself.
    const assignees = (id: string) =>
      within(card(id)).getByText(`Task ${id}`).dataset.assignees;
    expect(assignees('t4')).toBe('false');
    expect(assignees('t1')).not.toBe('false');
  });

  it('lists unowned tasks of the running sprint while planning the next', async () => {
    api.moveTasks.mockResolvedValue({ moved: 1 });
    renderPlan({ sprints: [active, planned] });
    await waitFor(async () => expect(await backlogIds()).toEqual(['t1', 't4']));
    expect(card('t4')).not.toHaveAttribute('data-plan-ghost');
    // Only tasks from another sprint name their sprint.
    expect(within(card('t4')).getByText('Sprint 14')).toBeInTheDocument();
    expect(within(card('t4')).getByText('Task t4').dataset.assignees).toBe(
      'false'
    );
    expect(within(card('t1')).queryByText('Sprint 15')).toBeNull();

    // Giving it an owner here plans it into the shown sprint first.
    await assignFromBacklog('t4', 'Binh');
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('ws-1', 't4', {
        assignee_ids: ['u-binh'],
      })
    );
    expect(api.moveTasks).toHaveBeenCalledWith('ws-1', 'board-1', 'sprint-15', [
      't4',
    ]);
  });

  it.each([
    ['assigns a ghost once it is in the sprint', true],
    ['leaves a ghost unassigned when it cannot join the sprint', false],
  ])('%s', async (_label, moveWorks) => {
    if (moveWorks) api.moveTasks.mockResolvedValue({ moved: 1 });
    else api.moveTasks.mockRejectedValue(new Error('network'));
    renderPlan({ sprints: [planned], unplanned: ['t4'] });
    await assignFromBacklog('t4', 'Binh');
    await waitFor(() =>
      expect(api.moveTasks).toHaveBeenCalledWith(
        'ws-1',
        'board-1',
        'sprint-15',
        ['t4']
      )
    );
    if (moveWorks) {
      await waitFor(() =>
        expect(api.update).toHaveBeenCalledWith('ws-1', 't4', {
          assignee_ids: ['u-binh'],
        })
      );
    } else {
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(api.update).not.toHaveBeenCalled();
    }
  });

  it('keeps the latest owner when a ghost moves again before it is placed', async () => {
    const pending: Array<() => void> = [];
    api.moveTasks.mockImplementation(
      () => new Promise((resolve) => pending.push(() => resolve({ moved: 1 })))
    );
    api.update.mockResolvedValue({ task: task('t4') });
    renderPlan({ sprints: [planned], unplanned: ['t4'] });
    await assignFromBacklog('t4', 'Ana');
    // Before the placement lands, drop it on Binh too; the later move is the
    // last write, so the earlier one cannot overwrite it.
    await assignFromBacklog('t4', 'Binh');
    await waitFor(() => expect(pending).toHaveLength(2));
    for (const place of pending) place();
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));
    expect(api.update.mock.calls.map(([, , patch]) => patch)).toEqual([
      { assignee_ids: ['u-ana'] },
      { assignee_ids: ['u-ana', 'u-binh'] },
    ]);
  });

  it('assigns each ghost when two join the sprint at once', async () => {
    const pending: Array<() => void> = [];
    api.moveTasks.mockImplementation(
      () => new Promise((resolve) => pending.push(() => resolve({ moved: 1 })))
    );
    api.listBoardTasksForSearch.mockResolvedValue([task('t4'), task('t5')]);
    renderPlan({ sprints: [planned], unplanned: ['t4', 't5'] });
    for (const id of ['t4', 't5']) {
      await assignFromBacklog(id, 'Binh');
    }
    await waitFor(() => expect(pending).toHaveLength(2));
    for (const resolve of pending) resolve();
    await waitFor(() => {
      expect(api.update).toHaveBeenCalledWith('ws-1', 't4', {
        assignee_ids: ['u-binh'],
      });
      expect(api.update).toHaveBeenCalledWith('ws-1', 't5', {
        assignee_ids: ['u-binh'],
      });
    });
  });

  it('takes a task out of every sprint, or on to a new sprint', async () => {
    api.unplan.mockResolvedValue({ moved: 1 });
    api.moveTasks.mockResolvedValue({ moved: 1 });
    // Another planner added Sprint 17 at the same time; the task goes to the
    // sprint this request created.
    api.addSprint.mockResolvedValue({
      addedSprintId: 'sprint-16',
      sprints: [
        active,
        planned,
        sprint(16, 'planned', []),
        sprint(17, 'planned', []),
      ],
    });
    renderPlan({ sprints: [active, planned] });
    await screen.findByText('Task t2');
    const menu = within(screen.getByRole('region', { name: 'Ana' }));
    fireEvent.click(menu.getByRole('menuitem', { name: 'remove_from_sprint' }));
    await waitFor(() =>
      expect(api.unplan).toHaveBeenCalledWith('ws-1', 'board-1', ['t2'])
    );

    // Sprint 15 is the last one, so moving on adds Sprint 16 first.
    fireEvent.click(
      menu.getByRole('menuitem', { name: 'move_to_next_sprint' })
    );
    await waitFor(() =>
      expect(api.moveTasks).toHaveBeenCalledWith(
        'ws-1',
        'board-1',
        'sprint-16',
        ['t2']
      )
    );
    expect(api.addSprint).toHaveBeenCalledWith('ws-1', 'board-1');
  });

  it('searches every open sprint from the header search', async () => {
    api.listBoardTasksForSearch.mockResolvedValue([
      task('t1'),
      task('t2', { assignees: [{ id: 'u-ana', display_name: 'Ana' }] }),
      task('t4', { assignees: [{ id: 'u-ana', display_name: 'Ana' }] }),
    ]);
    renderPlan({ searchQuery: 'task t4', sprints: [active, planned] });

    const ana = await screen.findByRole('region', { name: 'Ana' });
    expect(await within(ana).findByText('Task t4')).toBeInTheDocument();
    expect(within(ana).getAllByText('Sprint 14').length).toBeGreaterThan(0);
    expect(within(ana).queryByText('Task t2')).toBeNull();
    const backlog = screen.getByRole('region', { name: 'backlog' });
    expect(within(backlog).queryAllByRole('article')).toHaveLength(0);
  });

  // The fixture's sprint list is fixed, so these follow the owner through
  // the backlog: a task with an owner leaves it.
  it('gives the task its owner at once and saves it once it is in the sprint', async () => {
    let land: (value: unknown) => void = () => undefined;
    api.moveTasks.mockReturnValue(
      new Promise((resolve) => {
        land = resolve;
      })
    );
    renderPlan({ sprints: [active, planned] });
    await assignFromBacklog('t4', 'Binh');

    await waitFor(async () => expect(await backlogIds()).toEqual(['t1']));
    expect(api.update).not.toHaveBeenCalled();

    land({ moved: 1 });
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('ws-1', 't4', {
        assignee_ids: ['u-binh'],
      })
    );
  });

  it('takes the owner back off with one message when the move fails', async () => {
    api.moveTasks.mockRejectedValue(new Error('network'));
    renderPlan({ sprints: [active, planned] });
    await assignFromBacklog('t4', 'Binh');

    await waitFor(() => expect(api.toastError).toHaveBeenCalled());
    await waitFor(async () => expect(await backlogIds()).toEqual(['t1', 't4']));
    expect(api.update).not.toHaveBeenCalled();
    expect(api.toastError).toHaveBeenCalledTimes(1);
    expect(api.toastError).toHaveBeenCalledWith('move_failed');
  });

  it('keeps every person while searching, so a match can still be planned', async () => {
    renderPlan({ searchQuery: 'task t1', sprints: [active, planned] });

    expect(
      await screen.findByRole('region', { name: 'Ana' })
    ).toBeInTheDocument();
    expect(screen.getByText('search_empty_owners:task t1')).toBeInTheDocument();
    await assignFromBacklog('t1', 'Binh');
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('ws-1', 't1', {
        assignee_ids: ['u-binh'],
      })
    );
  });

  it("lists every sprint's unfinished work with its sprint under All sprints", async () => {
    api.unplan.mockResolvedValue({ moved: 1 });
    api.createWorkspaceTask.mockResolvedValue({ task: task('t9') });
    renderPlan({ sprints: [active, planned] });
    await screen.findByText('Task t1');
    fireEvent.click(screen.getByRole('menuitemradio', { name: /all_sprints/ }));
    await waitFor(async () => expect(await backlogIds()).toEqual(['t1', 't4']));
    // Each card names its sprint.
    expect(within(card('t4')).getByText('Sprint 14')).toBeInTheDocument();
    expect(within(card('t1')).getByText('Sprint 15')).toBeInTheDocument();
    expect(screen.queryByText('Task t3')).not.toBeInTheDocument();

    // A task created here sits in no sprint.
    fireEvent.click(screen.getByRole('button', { name: 'add_to_backlog' }));
    const input = screen.getByRole('textbox', { name: 'new_backlog_task' });
    fireEvent.change(input, { target: { value: 'Someday' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(api.unplan).toHaveBeenCalledWith('ws-1', 'board-1', ['t9'])
    );
  });

  it('plans ahead up to five open sprints and removes only the last', async () => {
    api.addSprint.mockResolvedValue({});
    api.removeSprint.mockResolvedValue({});
    const later = sprint(16, 'planned', []);
    const { unmount } = renderPlan({ sprints: [planned, later] });
    await screen.findByText('Task t1');
    fireEvent.click(screen.getByRole('menuitem', { name: /add_sprint/ }));
    await waitFor(() =>
      expect(api.addSprint).toHaveBeenCalledWith('ws-1', 'board-1')
    );
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'remove_sprint:Sprint 16' })
    );
    await waitFor(() =>
      expect(api.removeSprint).toHaveBeenCalledWith(
        'ws-1',
        'board-1',
        'sprint-16'
      )
    );

    // Only the next sprint starts.
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Sprint 16/ }));
    expect(
      screen.queryByRole('button', { name: /^start:/ })
    ).not.toBeInTheDocument();
    unmount();

    renderPlan({
      sprints: [
        active,
        planned,
        later,
        sprint(17, 'planned', []),
        sprint(18, 'planned', []),
      ],
    });
    await screen.findByText('Task t1');
    expect(screen.getByRole('menuitem', { name: /add_sprint/ })).toBeDisabled();
  });
});
