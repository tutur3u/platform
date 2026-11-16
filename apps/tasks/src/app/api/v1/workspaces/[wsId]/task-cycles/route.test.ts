import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import {
  coMemberTables,
  createFakeAdmin,
  type FakeTables,
} from '@/test/co-member-admin-fake';

const state = {
  rows: [] as unknown[],
  selects: [] as string[],
  admin: { from: () => ({}) } as unknown,
};

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

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => state.admin,
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

describe('GET task cycles creator names (D246)', () => {
  const WS_ID = 'ws-1';
  const creatorRow = {
    id: 'cycle-1',
    name: 'Cycle',
    creator: {
      id: 'creator-1',
      display_name: null,
      handle: 'creator-handle',
      avatar_url: null,
    },
    task_cycle_tasks: [],
  };

  async function creatorFor(tables: FakeTables) {
    state.rows = [creatorRow];
    state.admin = createFakeAdmin(tables);
    const response = await GET(new NextRequest('http://localhost/api'), {
      params: Promise.resolve({ wsId: WS_ID }),
    });
    const body = (await response.json()) as {
      creator: Record<string, unknown>;
    }[];
    return body[0]?.creator;
  }

  const members = [
    { user_id: 'member-1', type: 'MEMBER' as const },
    { user_id: 'creator-1', type: 'MEMBER' as const },
  ];
  const emails = [{ user_id: 'creator-1', email: 'creator@example.com' }];

  it('shows a nameless co-member creator by email to a member viewer', async () => {
    const creator = await creatorFor(
      coMemberTables({ wsId: WS_ID, members, emails })
    );

    expect(creator).toEqual({
      id: 'creator-1',
      display_name: 'creator@example.com',
      avatar_url: null,
    });
    expect(state.selects.at(-1)).toMatch(/display_name,\s*handle,/);
  });

  it('falls back to the handle when the workspace hides member emails', async () => {
    const creator = await creatorFor(
      coMemberTables({ wsId: WS_ID, hideEmail: true, members, emails })
    );

    expect(creator?.display_name).toBe('creator-handle');
    expect(JSON.stringify(creator)).not.toContain('@example.com');
  });

  it('never shows the email to a guest viewer', async () => {
    const creator = await creatorFor(
      coMemberTables({
        wsId: WS_ID,
        members: [
          { user_id: 'member-1', type: 'GUEST' },
          { user_id: 'creator-1', type: 'MEMBER' },
        ],
        emails,
      })
    );

    expect(creator?.display_name).toBe('creator-handle');
  });
});
