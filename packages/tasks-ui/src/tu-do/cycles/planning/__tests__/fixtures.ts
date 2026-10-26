import type { CyclePlanningCycle, CyclePlanningTask } from '../types';

export const ME = 'user-me';

export function makeTask(
  overrides: Partial<CyclePlanningTask> & { id: string }
): CyclePlanningTask {
  return {
    name: `Task ${overrides.id}`,
    display_number: 1,
    ticket_prefix: 'TT',
    priority: null,
    status: 'not_started',
    board_id: 'board-1',
    cycle_id: null,
    assignees: [],
    projects: [],
    labels: [],
    ...overrides,
  };
}

export const ALICE = { id: 'alice', display_name: 'Alice', avatar_url: null };
export const MYSELF = { id: ME, display_name: 'Me Myself', avatar_url: null };
export const APOLLO = { id: 'apollo', name: 'Apollo' };

export const CYCLES: CyclePlanningCycle[] = [
  {
    id: 'cycle-old',
    name: 'Sprint 1',
    status: 'completed',
    start_date: '2026-09-01',
    end_date: '2026-09-14',
  },
  {
    id: 'cycle-now',
    name: 'Sprint 4',
    status: 'active',
    start_date: '2026-10-20',
    end_date: '2026-11-02',
  },
  {
    id: 'cycle-later',
    name: 'Sprint 6',
    status: 'planned',
    start_date: '2026-11-17',
    end_date: '2026-11-30',
  },
  {
    id: 'cycle-next',
    name: 'Sprint 5',
    status: 'planned',
    start_date: '2026-11-03',
    end_date: '2026-11-16',
  },
];
