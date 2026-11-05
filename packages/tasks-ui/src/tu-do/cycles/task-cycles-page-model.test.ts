import { describe, expect, it, vi } from 'vitest';
import {
  countCurrentCycleTasks,
  currentCycleLink,
  loadTaskCycles,
} from './task-cycles-page-model';

const OLD_CYCLE = '00000000-0000-4000-8000-0000000000c1';
const NEW_CYCLE = '00000000-0000-4000-8000-0000000000c2';
const SPRINT = '00000000-0000-4000-8000-0000000000d1';
const DELETED = '00000000-0000-4000-8000-0000000000e1';

const JAN = '2026-01-01T00:00:00Z';
const FEB = '2026-02-01T00:00:00Z';
const MAR = '2026-03-01T00:00:00Z';

describe('currentCycleLink', () => {
  it('picks the newest link, then the lowest cycle_id', () => {
    expect(
      currentCycleLink([
        { cycle_id: OLD_CYCLE, created_at: JAN },
        { cycle_id: NEW_CYCLE, created_at: FEB },
      ])?.cycle_id
    ).toBe(NEW_CYCLE);
    expect(
      currentCycleLink([
        { cycle_id: NEW_CYCLE, created_at: JAN },
        { cycle_id: OLD_CYCLE, created_at: JAN },
      ])?.cycle_id
    ).toBe(OLD_CYCLE);
    expect(currentCycleLink([])).toBeNull();
  });
});

describe('countCurrentCycleTasks', () => {
  it('counts a task with duplicate workspace-cycle links only in its newest cycle', () => {
    const counts = countCurrentCycleTasks([
      {
        id: OLD_CYCLE,
        task_cycle_tasks: [
          { task_id: 'dup', created_at: JAN },
          { task_id: 'only-old', created_at: JAN },
        ],
      },
      {
        id: NEW_CYCLE,
        task_cycle_tasks: [{ task_id: 'dup', created_at: FEB }],
      },
    ]);

    expect(counts.get(OLD_CYCLE)).toBe(1);
    expect(counts.get(NEW_CYCLE)).toBe(1);
  });

  it('ignores board-sprint and deleted-cycle links when picking the current cycle', () => {
    const counts = countCurrentCycleTasks([
      {
        id: OLD_CYCLE,
        task_cycle_tasks: [{ task_id: 'dup', created_at: JAN }],
      },
      {
        id: SPRINT,
        board_id: 'board-1',
        task_cycle_tasks: [{ task_id: 'dup', created_at: MAR }],
      },
      {
        id: DELETED,
        deleted: true,
        task_cycle_tasks: [{ task_id: 'dup', created_at: MAR }],
      },
    ]);

    // The task stays counted in its workspace cycle, and each board sprint
    // or deleted cycle still reports its own rows.
    expect(counts.get(OLD_CYCLE)).toBe(1);
    expect(counts.get(SPRINT)).toBe(1);
    expect(counts.get(DELETED)).toBe(1);
  });

  it('reports zero for an empty cycle', () => {
    expect(
      countCurrentCycleTasks([{ id: OLD_CYCLE, task_cycle_tasks: null }]).get(
        OLD_CYCLE
      )
    ).toBe(0);
  });
});

describe('loadTaskCycles', () => {
  it('reports tasksCount by the newest-link rule', async () => {
    const select = vi.fn((_columns: string) => ({
      eq: () => ({
        order: async () => ({
          data: [
            {
              id: NEW_CYCLE,
              name: 'New',
              status: 'active',
              task_cycle_tasks: [{ task_id: 'dup', created_at: FEB }],
            },
            {
              id: OLD_CYCLE,
              name: 'Old',
              status: 'planned',
              task_cycle_tasks: [{ task_id: 'dup', created_at: JAN }],
            },
          ],
          error: null,
        }),
      }),
    }));
    const supabase = { from: () => ({ select }) };

    const cycles = await loadTaskCycles(supabase as never, 'ws-1');

    expect(cycles?.map((cycle) => [cycle.id, cycle.tasksCount])).toEqual([
      [NEW_CYCLE, 1],
      [OLD_CYCLE, 0],
    ]);
    expect(String(select.mock.calls[0]?.[0])).toContain(
      'task_cycle_tasks(task_id, created_at)'
    );
  });
});
