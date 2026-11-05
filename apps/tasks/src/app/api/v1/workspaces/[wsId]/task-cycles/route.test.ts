import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const state = { rows: [] as unknown[], selects: [] as string[] };

function builder() {
  const query: Record<string, unknown> = {};
  query.select = (columns: string) => {
    state.selects.push(columns);
    return query;
  };
  query.eq = () => query;
  query.order = async () => ({ data: state.rows, error: null });
  return query;
}

vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({
    supabase: { from: () => builder() },
    user: { id: 'member-1' },
    authError: null,
  }),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
}));

import { GET } from './route';

describe('GET task cycles', () => {
  it('counts a task with duplicate workspace-cycle links only in its newest cycle', async () => {
    state.rows = [
      {
        id: 'cycle-new',
        name: 'New',
        task_cycle_tasks: [
          { task_id: 'dup', created_at: '2026-02-01T00:00:00Z' },
        ],
      },
      {
        id: 'cycle-old',
        name: 'Old',
        task_cycle_tasks: [
          { task_id: 'dup', created_at: '2026-01-01T00:00:00Z' },
          { task_id: 'only-old', created_at: '2026-01-01T00:00:00Z' },
        ],
      },
      {
        // Board sprint rows are per-sprint membership, counted as they are,
        // and never take a task out of its workspace cycle.
        id: 'sprint-1',
        name: 'Sprint 1',
        board_id: 'board-1',
        task_cycle_tasks: [
          { task_id: 'dup', created_at: '2026-03-01T00:00:00Z' },
        ],
      },
    ];

    const response = await GET(new NextRequest('http://localhost/api'), {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });
    const body = (await response.json()) as {
      id: string;
      tasksCount: number;
    }[];

    expect(body.map((cycle) => [cycle.id, cycle.tasksCount])).toEqual([
      ['cycle-new', 1],
      ['cycle-old', 1],
      ['sprint-1', 1],
    ]);
    expect(state.selects[0]).toMatch(
      /task_cycle_tasks\(\s*task_id,\s*created_at\s*\)/
    );
  });
});
