import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  boardHasFleetTasks,
  resolveEnabledViews,
} from '../shared/board-enabled-views';
import { FleetBoardView } from './fleet-board-view';

const openTask = vi.fn();

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));
vi.mock('../hooks/useTaskDialog', () => ({
  useTaskDialog: () => ({ openTask }),
}));

const block = (fields: string) =>
  `<!-- fleet:v1 -->\n${fields}\n<!-- /fleet:v1 -->\n\n## Summary\nNotes.`;

function task(id: string, name: string, listId: string, fields: string): Task {
  return {
    id,
    name,
    list_id: listId,
    display_number: Number(id.replace(/\D/g, '')) || 1,
    created_at: '2026-11-18T00:00:00Z',
    description: block(fields),
  } as Task;
}

const lists = [
  { id: 'live', name: 'Live Today', status: 'active' },
  { id: 'review', name: 'Needs User / Review', status: 'review' },
  { id: 'queued', name: 'Queued', status: 'not_started' },
  { id: 'done', name: 'Done', status: 'done' },
  { id: 'closed', name: 'Archived', status: 'closed' },
] as TaskList[];

const tasks = [
  task(
    't1',
    'Approve the Meet classroom limits migration',
    'review',
    'status: waiting_review\nowner: rex\nproduct: meet\npriority: critical\nneeds_user: true\nneeds_user_reason: Production migration needs your OK'
  ),
  task(
    't2',
    'Fleet cockpit web view',
    'live',
    'status: running\nowner: claude\nproduct: tasks\npriority: high'
  ),
  task(
    't3',
    'Upskii ledger reconciliation',
    'live',
    'status: blocked\nowner: cora\nproduct: upskii\nblocked_by: Waiting for the billing export'
  ),
  task('t4', 'Mail search warm-up', 'queued', 'status: queued\nproduct: mail'),
  task('t5', 'Mobile placeholder rule', 'done', 'status: done\nproduct: tasks'),
  task('t6', 'Old archived card', 'closed', 'status: done\nproduct: tasks'),
  {
    ...task('t7', 'N-165: Fleet board card face', 'live', 'status: running'),
    external_key: 'N-165',
    relationship_summary: {
      parent_task_id: null,
      child_count: 0,
      blocked_by_count: 2,
      blocking_count: 0,
      related_count: 0,
    },
  } as Task,
  {
    ...task(
      't8',
      'Shipped with a leftover blocker',
      'done',
      'status: done\nblocked_by: Old export'
    ),
    relationship_summary: {
      parent_task_id: null,
      child_count: 0,
      blocked_by_count: 1,
      blocking_count: 0,
      related_count: 0,
    },
  } as Task,
  {
    ...task('t9', 'Stuck without a reason', 'live', 'owner: cora'),
    labels: [{ name: 'state:blocked' }],
  } as Task,
];

describe('FleetBoardView', () => {
  beforeEach(() => openTask.mockClear());

  it('opens on the three triage buckets and keeps queued and done cards out', () => {
    render(
      <FleetBoardView
        boardId="b1"
        isPersonalWorkspace={false}
        lists={lists}
        tasks={tasks}
        workspaceId="ws1"
      />
    );
    const needs = screen.getByRole('region', { name: 'buckets.needs_me' });
    const live = screen.getByRole('region', { name: 'buckets.live' });
    const blocked = screen.getByRole('region', { name: 'buckets.blocked' });
    expect(
      within(needs).getByText('Approve the Meet classroom limits migration')
    ).toBeTruthy();
    expect(
      within(needs).getByText('Production migration needs your OK')
    ).toBeTruthy();
    expect(within(live).getByText('Fleet cockpit web view')).toBeTruthy();
    expect(
      within(blocked).getByText('Upskii ledger reconciliation')
    ).toBeTruthy();
    expect(screen.queryByText('Mail search warm-up')).toBeNull();
    expect(screen.queryByText('Mobile placeholder rule')).toBeNull();
  });

  it('lists queued and recently done cards in collapsed sections, without archived cards', () => {
    render(
      <FleetBoardView
        boardId="b1"
        isPersonalWorkspace={false}
        lists={lists}
        tasks={tasks}
        workspaceId="ws1"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /sections\.up_next/ }));
    fireEvent.click(
      screen.getByRole('button', { name: /sections\.recently_done/ })
    );
    expect(
      within(
        screen.getByRole('region', { name: 'sections.up_next' })
      ).getByText('Mail search warm-up')
    ).toBeTruthy();
    expect(
      within(
        screen.getByRole('region', { name: 'sections.recently_done' })
      ).getByText('Mobile placeholder rule')
    ).toBeTruthy();
    expect(screen.queryByText('Old archived card')).toBeNull();
  });

  it('drops the duplicated code from the title and names unexplained blockers', () => {
    render(
      <FleetBoardView
        boardId="b1"
        isPersonalWorkspace={false}
        lists={lists}
        tasks={tasks}
        workspaceId="ws1"
      />
    );
    const blocked = screen.getByRole('region', { name: 'buckets.blocked' });
    const card = within(blocked).getByRole('article', {
      name: 'N-165: Fleet board card face',
    });
    expect(within(card).getByText('Fleet board card face')).toBeTruthy();
    expect(within(card).getByText('N-165')).toBeTruthy();
    expect(within(card).getByText('blocked_by_tasks {"count":2}')).toBeTruthy();
    expect(
      within(
        within(blocked).getByRole('article', {
          name: 'Upskii ledger reconciliation',
        })
      ).getByText('Waiting for the billing export')
    ).toBeTruthy();
    expect(
      within(
        within(blocked).getByRole('article', { name: 'Stuck without a reason' })
      ).getByText('empty.no_blocker')
    ).toBeTruthy();
  });

  it('shows no blocker line on done cards', () => {
    render(
      <FleetBoardView
        boardId="b1"
        isPersonalWorkspace={false}
        lists={lists}
        tasks={tasks}
        workspaceId="ws1"
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: /sections\.recently_done/ })
    );
    const card = screen.getByRole('article', {
      name: 'Shipped with a leftover blocker',
    });
    expect(within(card).queryByText('blocked_by')).toBeNull();
    expect(within(card).queryByText('Old export')).toBeNull();
  });

  it('opens the task detail when a card title is clicked', () => {
    render(
      <FleetBoardView
        boardId="b1"
        isPersonalWorkspace={false}
        lists={lists}
        tasks={tasks}
        workspaceId="ws1"
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Fleet cockpit web view' })
    );
    expect(openTask).toHaveBeenCalledWith(tasks[1], 'b1', lists, false, {
      taskWsId: 'ws1',
      taskWorkspacePersonal: false,
    });
  });
});

describe('board view availability', () => {
  it('leads with Fleet only on boards that carry fleet tasks', () => {
    expect(boardHasFleetTasks(tasks)).toBe(true);
    expect(boardHasFleetTasks([{ description: 'Buy milk', labels: [] }])).toBe(
      false
    );
    expect(
      resolveEnabledViews({
        hasFleetTasks: true,
        publicView: false,
        readOnly: false,
      })[0]
    ).toBe('fleet');
    expect(
      resolveEnabledViews({
        hasFleetTasks: false,
        publicView: false,
        readOnly: false,
      })
    ).not.toContain('fleet');
    expect(
      resolveEnabledViews({
        hasFleetTasks: true,
        publicView: true,
        readOnly: false,
      })
    ).toEqual(['fleet', 'kanban', 'list', 'timeline']);
    expect(
      resolveEnabledViews({
        availableViews: ['list'],
        hasFleetTasks: true,
        publicView: false,
        readOnly: false,
      })
    ).toEqual(['list']);
  });
});
