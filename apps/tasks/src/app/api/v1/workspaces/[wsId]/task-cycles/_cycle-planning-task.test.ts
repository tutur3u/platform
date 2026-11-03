import { describe, expect, it } from 'vitest';
import {
  cyclePlanningTaskSelect,
  type RawPlanningTask,
  toCyclePlanningTask,
} from './_cycle-planning-task';

const OLDER_CYCLE = '00000000-0000-4000-8000-0000000000c1';
const NEWER_CYCLE = '00000000-0000-4000-8000-0000000000c2';
const LOW_CYCLE = '00000000-0000-4000-8000-0000000000a1';
const HIGH_CYCLE = '00000000-0000-4000-8000-0000000000f1';

function task(cycleLinks: RawPlanningTask['cycle_links']): RawPlanningTask {
  return {
    id: 'task-1',
    name: 'Task',
    display_number: 1,
    priority: null,
    list: { status: 'active', board: { id: 'board-1', ticket_prefix: null } },
    cycle_links: cycleLinks,
    assignees: [],
    projects: [],
    labels: [],
  };
}

describe('cyclePlanningTaskSelect', () => {
  it('selects created_at on cycle links so reads can order them', () => {
    expect(cyclePlanningTaskSelect('left')).toContain(
      'cycle_links:task_cycle_tasks!left(cycle_id, created_at)'
    );
    expect(cyclePlanningTaskSelect('inner')).toContain(
      'cycle_links:task_cycle_tasks!inner(cycle_id, created_at)'
    );
  });
});

describe('toCyclePlanningTask cycle_id with pre-existing duplicate links', () => {
  const older = { cycle_id: OLDER_CYCLE, created_at: '2026-01-01T00:00:00+00:00' };
  const newer = { cycle_id: NEWER_CYCLE, created_at: '2026-02-01T00:00:00+00:00' };

  it('picks the newest link whatever order PostgREST returns', () => {
    expect(toCyclePlanningTask(task([older, newer])).cycle_id).toBe(
      NEWER_CYCLE
    );
    expect(toCyclePlanningTask(task([newer, older])).cycle_id).toBe(
      NEWER_CYCLE
    );
  });

  it('breaks created_at ties by the lowest cycle_id', () => {
    const at = '2026-03-01T00:00:00+00:00';
    const high = { cycle_id: HIGH_CYCLE, created_at: at };
    const low = { cycle_id: LOW_CYCLE, created_at: at };

    expect(toCyclePlanningTask(task([high, low])).cycle_id).toBe(LOW_CYCLE);
    expect(toCyclePlanningTask(task([low, high])).cycle_id).toBe(LOW_CYCLE);
  });

  it('ranks a link without created_at after dated links', () => {
    const undated = { cycle_id: LOW_CYCLE, created_at: null };

    expect(toCyclePlanningTask(task([undated, older])).cycle_id).toBe(
      OLDER_CYCLE
    );
    expect(toCyclePlanningTask(task([older, undated])).cycle_id).toBe(
      OLDER_CYCLE
    );
  });

  it('compares instants, not timestamp strings', () => {
    const utc = { cycle_id: HIGH_CYCLE, created_at: '2026-04-01T00:30:00+00:00' };
    // 23:00 at -02:00 is 01:00 UTC, which is later than 00:30 UTC.
    const offset = { cycle_id: LOW_CYCLE, created_at: '2026-03-31T23:00:00-02:00' };

    expect(toCyclePlanningTask(task([utc, offset])).cycle_id).toBe(LOW_CYCLE);
  });

  it('returns null for a task in no cycle', () => {
    expect(toCyclePlanningTask(task([])).cycle_id).toBeNull();
    expect(toCyclePlanningTask(task(null)).cycle_id).toBeNull();
  });
});
