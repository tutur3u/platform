import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api, renderPlan, sprint, task } from './board-plan-view.fixtures';

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
  });

  it.each([
    ['assigns a ghost once it is in the sprint', true],
    ['leaves a ghost unassigned when it cannot join the sprint', false],
  ])('%s', async (_label, moveWorks) => {
    if (moveWorks) api.moveTasks.mockResolvedValue({ moved: 1 });
    else api.moveTasks.mockRejectedValue(new Error('network'));
    renderPlan({ sprints: [planned], unplanned: ['t4'] });
    fireEvent.click(
      await screen.findByRole('button', { name: 'assign:Task t4' })
    );
    fireEvent.click(within(card('t4')).getByRole('menuitem', { name: /Binh/ }));
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

  it('assigns each ghost when two join the sprint at once', async () => {
    const pending: Array<() => void> = [];
    api.moveTasks.mockImplementation(
      () => new Promise((resolve) => pending.push(() => resolve({ moved: 1 })))
    );
    api.listBoardTasksForSearch.mockResolvedValue([task('t4'), task('t5')]);
    renderPlan({ sprints: [planned], unplanned: ['t4', 't5'] });
    for (const id of ['t4', 't5']) {
      fireEvent.click(
        await screen.findByRole('button', { name: `assign:Task ${id}` })
      );
      fireEvent.click(within(card(id)).getByRole('menuitem', { name: /Binh/ }));
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

  it('moves a task to any open sprint or out of every sprint', async () => {
    api.moveTasks.mockResolvedValue({ moved: 1 });
    api.unplan.mockResolvedValue({ moved: 1 });
    renderPlan({ sprints: [active, planned] });
    await screen.findByText('Task t1');
    const menu = within(card('t1'));
    fireEvent.click(
      menu.getByRole('menuitem', { name: 'move_to_sprint:Sprint 14' })
    );
    await waitFor(() =>
      expect(api.moveTasks).toHaveBeenCalledWith(
        'ws-1',
        'board-1',
        'sprint-14',
        ['t1']
      )
    );
    fireEvent.click(menu.getByRole('menuitem', { name: 'no_sprint' }));
    await waitFor(() =>
      expect(api.unplan).toHaveBeenCalledWith('ws-1', 'board-1', ['t1'])
    );
  });

  it("lists every sprint's unfinished work with its sprint under All sprints", async () => {
    api.unplan.mockResolvedValue({ moved: 1 });
    api.createWorkspaceTask.mockResolvedValue({ task: task('t9') });
    renderPlan({ sprints: [active, planned] });
    await screen.findByText('Task t1');
    fireEvent.click(screen.getByRole('menuitemradio', { name: /all_sprints/ }));
    await waitFor(async () => expect(await backlogIds()).toEqual(['t1', 't4']));
    // Each card names its sprint (and its sprint menu repeats it).
    expect(within(card('t4')).getAllByText('Sprint 14')).toHaveLength(2);
    expect(within(card('t1')).getAllByText('Sprint 15')).toHaveLength(2);
    expect(screen.queryByText('Task t3')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'goal' })
    ).not.toBeInTheDocument();

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
