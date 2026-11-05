import { describe, expect, it } from 'vitest';
import {
  buildOpenSprintByTaskId,
  formatSprintDateRange,
  formatSprintShortRange,
  getCurrentBoardSprint,
  getDaysUntilSprintEnd,
  getLoadedSprintProgress,
  getPlanningBoardSprint,
  getSprintProgress,
  getTaskEffectiveDueDate,
  getTaskSprintHistory,
  isTaskInCurrentSprintView,
  isTaskOverdueByOwnDate,
} from './sprints';

const sprint = (
  sequence: number,
  status: 'planned' | 'active' | 'completed',
  taskIds: string[],
  dates: { start: string; end: string } = {
    start: '2026-10-19',
    end: '2026-10-30',
  }
) => ({
  id: `sprint-${sequence}`,
  name: `Sprint ${sequence}`,
  sequence_number: sequence,
  status,
  start_date: dates.start,
  end_date: dates.end,
  tasks: taskIds.map((task_id) => ({ task_id })),
});

describe('board sprint helpers', () => {
  const closed = sprint(13, 'completed', ['a', 'b']);
  const active = sprint(14, 'active', ['a', 'c']);
  const planned = sprint(15, 'planned', ['d'], {
    start: '2026-11-02',
    end: '2026-11-13',
  });
  const sprints = [closed, active, planned];

  it('picks the running sprint for the board, else the one being planned', () => {
    expect(getCurrentBoardSprint(sprints)).toBe(active);
    expect(getCurrentBoardSprint([closed, planned])).toBe(planned);
    expect(getCurrentBoardSprint([closed])).toBeNull();
    expect(getPlanningBoardSprint(sprints)).toBe(planned);
  });

  it('maps tasks to their open sprint and ignores closed ones', () => {
    const byTask = buildOpenSprintByTaskId(sprints);
    expect(byTask.get('a')).toBe(active);
    expect(byTask.get('d')).toBe(planned);
    expect(byTask.has('b')).toBe(false);
  });

  it('lists the sprints a task went through in order', () => {
    expect(
      getTaskSprintHistory([planned, active, closed], 'a').map(
        (item) => item.sequence_number
      )
    ).toEqual([13, 14]);
  });

  it('uses the own due date first and the sprint end otherwise', () => {
    expect(getTaskEffectiveDueDate({ end_date: '2026-10-28' }, active)).toEqual(
      { date: '2026-10-28', source: 'own' }
    );
    expect(getTaskEffectiveDueDate({ end_date: null }, active)).toEqual({
      date: '2026-10-30',
      source: 'sprint',
    });
    expect(getTaskEffectiveDueDate({}, null)).toBeNull();
  });

  it('only counts own due dates as overdue', () => {
    const now = new Date('2026-10-29T12:00:00Z');
    expect(
      isTaskOverdueByOwnDate({ end_date: '2026-10-28T18:00:00Z' }, now)
    ).toBe(true);
    expect(
      isTaskOverdueByOwnDate(
        {
          end_date: '2026-10-28T18:00:00Z',
          completed_at: '2026-10-28T10:00:00Z',
        },
        now
      )
    ).toBe(false);
    expect(isTaskOverdueByOwnDate({ end_date: null }, now)).toBe(false);
  });

  it('counts sprint progress from finished tasks', () => {
    expect(getSprintProgress(active, (id) => id === 'c')).toEqual({
      done: 1,
      total: 2,
      ratio: 0.5,
    });
    expect(getSprintProgress(sprint(1, 'planned', []), () => true).ratio).toBe(
      0
    );
  });

  it('counts whole days until the sprint ends', () => {
    expect(getDaysUntilSprintEnd(active, new Date(2026, 9, 29))).toBe(1);
    expect(getDaysUntilSprintEnd(active, new Date(2026, 10, 2))).toBe(-3);
  });

  it('formats sprint dates without time', () => {
    expect(formatSprintDateRange(active, 'en-GB')).toBe(
      '19 Oct 2026 - 30 Oct 2026'
    );
    // The app's English locale reads day first too.
    expect(formatSprintDateRange(active, 'en')).toBe(
      '19 Oct 2026 - 30 Oct 2026'
    );
  });

  it('shortens the range for labels beside a sprint name', () => {
    // ICU spaces ranges with thin spaces; compare the visible text.
    const short = (range: { start_date: string; end_date: string }) =>
      formatSprintShortRange(range, 'en').replace(/\s/g, ' ');
    expect(short(active)).toBe('19 – 30 Oct');
    expect(short({ start_date: '2026-10-27', end_date: '2026-11-06' })).toBe(
      '27 Oct – 6 Nov'
    );
  });

  it('counts unloaded finished tasks from the sprint record and loaded ones live', () => {
    const sprint = {
      tasks: [
        { task_id: 'loaded-open', done: true },
        { task_id: 'loaded-done', done: false },
        { task_id: 'unloaded-done', done: true },
        { task_id: 'unloaded-open', done: false },
      ],
    };
    const loaded = new Map([
      ['loaded-open', { id: 'loaded-open', completed_at: null }],
      ['loaded-done', { id: 'loaded-done', completed_at: '2026-10-28' }],
    ]);
    expect(getLoadedSprintProgress(sprint, loaded)).toMatchObject({
      done: 2,
      total: 4,
    });
  });

  describe('isTaskInCurrentSprintView', () => {
    const member = (task_id: string) => ({ task_id });
    const current = {
      status: 'active' as const,
      started_at: '2026-10-27T09:00:00Z',
      tasks: [member('in-current')],
    };
    const planned = { status: 'planned' as const, tasks: [member('waiting')] };
    const past = { status: 'completed' as const, tasks: [member('past')] };
    const sprints = [past, current, planned];
    const view = (task: {
      id: string;
      completed_at?: string | null;
      created_at?: string;
    }) => isTaskInCurrentSprintView(task, sprints, current);

    it('shows the current sprint and hides tasks waiting in the planned one', () => {
      expect(view({ id: 'in-current' })).toBe(true);
      expect(view({ id: 'waiting' })).toBe(false);
    });

    it('shows a new, moved, restored or reopened open task before the sprints refresh', () => {
      expect(view({ id: 'brand-new' })).toBe(true);
      expect(view({ id: 'past' })).toBe(true);
    });

    it('hides finished work from past sprints or from before sprints were on', () => {
      expect(view({ id: 'past', completed_at: '2026-10-20' })).toBe(false);
      expect(
        view({
          id: 'legacy',
          completed_at: '2026-10-01',
          created_at: '2026-09-01T00:00:00Z',
        })
      ).toBe(false);
    });

    it('shows a task created finished during the running sprint', () => {
      expect(
        view({
          id: 'done-now',
          completed_at: '2026-10-28',
          created_at: '2026-10-28T10:00:00Z',
        })
      ).toBe(true);
    });

    it('shows everything without a current sprint', () => {
      expect(isTaskInCurrentSprintView({ id: 'x' }, sprints, null)).toBe(true);
    });
  });
});
