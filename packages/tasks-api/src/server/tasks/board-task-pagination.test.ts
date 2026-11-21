import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  PERSONAL_BOARD_ID,
  PERSONAL_WS_ID,
  PLACED_TASK_ID,
  UNPLACED_TASK_ID,
  USER_ID,
  mocks,
  queueResult,
  queuePersonalWorkspace,
  queueNoSourceMembership,
  externalTask,
  resetTaskRouteFixtures,
} from './task-route.test-fixture';

const CREATED_AT = '2026-05-07T00:00:00.000Z';

describe('workspace task board pagination', () => {
  beforeEach(resetTaskRouteFixtures);

  it('caps cursor pages at 50 tasks and seeks after the last delivered row', async () => {
    const rows = Array.from({ length: 52 }, (_, index) =>
      externalTask(`aaa00000-0000-4000-8000-${String(index).padStart(12, '0')}`)
    );

    for (const page of [rows.slice(0, 51), rows.slice(50)]) {
      queueResult(mocks.adminQueues, 'workspaces', {
        data: { personal: false },
        error: null,
      });
      queueResult(mocks.adminQueues, 'tasks', { data: page, error: null });
    }
    const first = await readCursor('start', '&limit=200');
    expect(first.status).toBe(200);
    const result = await first.json();
    expect(result.tasks.map((task: { id: string }) => task.id)).toEqual(
      rows.slice(0, 50).map((row) => row.id)
    );
    expect(result.nextCursor).toBe(`board~${rows[49]?.id}~${CREATED_AT}`);

    const last = await readCursor(encodeURIComponent(result.nextCursor));
    expect(last.status).toBe(200);
    expect(await last.json()).toMatchObject({
      tasks: [{ id: rows[50]?.id }, { id: rows[51]?.id }],
      nextCursor: null,
    });

    const taskQueries = mocks.adminQueries.filter(
      ({ table }) => table === 'tasks'
    );
    expect(taskQueries).toHaveLength(2);
    for (const query of taskQueries) {
      // One lookahead row past the 50-row page budget, never a range scan.
      expect(query.calls).toContainEqual(['limit', [51]]);
      expect(query.calls).toContainEqual(['order', ['id']]);
      expect(query.calls).toContainEqual([
        'eq',
        ['task_lists.workspace_boards.ws_id', PERSONAL_WS_ID],
      ]);
      expect(query.calls.some(([method]) => method === 'range')).toBe(false);
    }
    expect(taskQueries[1]?.calls).toContainEqual([
      'or',
      [
        `created_at.lt.${CREATED_AT},and(created_at.eq.${CREATED_AT},id.gt.${rows[49]?.id}),created_at.is.null`,
      ],
    ]);
  });

  it.each([
    'board.invalid',
    'board~not-a-uuid~null',
    `board~${UNPLACED_TASK_ID}~yesterday`,
    `placed~${UNPLACED_TASK_ID}~extra`,
    'filtered~50',
  ])(
    'rejects the malformed cursor %s before reading task rows',
    async (cursor) => {
      const response = await readCursor(encodeURIComponent(cursor));
      expect(response.status).toBe(400);
      expect(mocks.adminClient.from).not.toHaveBeenCalledWith('tasks');
    }
  );

  it.each([
    '&sourceScope=external_current_workspace',
    '&q=release',
    '&labelIds=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '&includeCount=true',
    '&offset=50',
  ])('rejects a cursor combined with %s', async (query) => {
    const response = await readCursor('start', query);
    expect(response.status).toBe(400);
    expect(mocks.adminClient.from).not.toHaveBeenCalledWith('tasks');
  });

  it('hands a personal board from its own tasks to its placements', async () => {
    queuePersonalWorkspace();
    queueResult(mocks.adminQueues, 'tasks', {
      data: [externalTask(UNPLACED_TASK_ID)],
      error: null,
    });
    const response = await readCursor('start');
    expect(response.status).toBe(200);
    expect((await response.json()).nextCursor).toBe('placed~start');
    expect(mocks.adminClient.from).not.toHaveBeenCalledWith(
      'task_user_overrides'
    );
  });

  it.each(['placed~start', 'assigned~start'])(
    'rejects %s outside a personal workspace',
    async (cursor) => {
      queueResult(mocks.adminQueues, 'workspaces', {
        data: { personal: false },
        error: null,
      });
      const response = await readCursor(cursor);
      expect(response.status).toBe(400);
      expect(mocks.adminClient.from).not.toHaveBeenCalledWith('tasks');
      expect(mocks.adminClient.from).not.toHaveBeenCalledWith(
        'task_user_overrides'
      );
    }
  );

  it('keeps personal external continuations bound to an active board in the target workspace', async () => {
    queuePersonalWorkspace();
    queueResult(mocks.adminQueues, 'workspace_boards', {
      data: null,
      error: null,
    });
    const response = await readCursor('assigned~start');
    expect(response.status).toBe(404);
    expect(
      mocks.adminQueries.find(({ table }) => table === 'workspace_boards')
        ?.calls
    ).toContainEqual(['eq', ['ws_id', PERSONAL_WS_ID]]);
    expect(mocks.adminClient.from).not.toHaveBeenCalledWith('tasks');
  });

  it('pages placements by the actor and the target board', async () => {
    queuePersonalWorkspace();
    queueResult(mocks.adminQueues, 'workspace_boards', {
      data: { id: PERSONAL_BOARD_ID },
      error: null,
    });
    queueResult(mocks.adminQueues, 'task_user_overrides', {
      data: [],
      error: null,
    });
    const response = await readCursor(`placed~${PLACED_TASK_ID}`);
    expect(response.status).toBe(200);
    expect((await response.json()).nextCursor).toBe('assigned~start');
    const placementQuery = mocks.adminQueries.find(
      ({ table }) => table === 'task_user_overrides'
    );
    expect(placementQuery?.calls).toContainEqual(['eq', ['user_id', USER_ID]]);
    expect(placementQuery?.calls).toContainEqual([
      'eq',
      ['personal_board_id', PERSONAL_BOARD_ID],
    ]);
    expect(placementQuery?.calls).toContainEqual([
      'gt',
      ['task_id', PLACED_TASK_ID],
    ]);
    expect(placementQuery?.calls).toContainEqual(['limit', [51]]);
  });

  it('checks source membership for an assigned external page', async () => {
    queuePersonalWorkspace();
    queueResult(mocks.adminQueues, 'workspace_boards', {
      data: { id: PERSONAL_BOARD_ID },
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      data: [externalTask(UNPLACED_TASK_ID)],
      error: null,
    });
    queueResult(mocks.adminQueues, 'task_user_overrides', {
      data: [],
      error: null,
    });
    queueNoSourceMembership();

    const response = await readCursor('assigned~start');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tasks: [], nextCursor: null });
    const assignedQuery = mocks.adminQueries.find(
      ({ table }) => table === 'tasks'
    );
    expect(assignedQuery?.calls).toContainEqual(['limit', [51]]);
    expect(assignedQuery?.calls).toContainEqual([
      'eq',
      ['_currentUserAssignment.user_id', USER_ID],
    ]);
    const placementLookup = mocks.adminQueries.find(
      ({ table }) => table === 'task_user_overrides'
    );
    expect(placementLookup?.calls).toContainEqual([
      'in',
      ['task_id', [UNPLACED_TASK_ID]],
    ]);
    expect(placementLookup?.calls).toContainEqual(['eq', ['user_id', USER_ID]]);
    // Staged placements (no personal list) also exclude the assigned copy.
    expect(
      placementLookup?.calls.some(
        ([method, args]) => method === 'not' && args[0] === 'personal_list_id'
      )
    ).toBe(false);
  });
});

async function readCursor(cursor: string, query = '') {
  const { GET } = await import('./route.js');
  return GET(
    new NextRequest(
      `http://localhost/api/v1/workspaces/ws-1/tasks?boardId=${PERSONAL_BOARD_ID}&cursor=${cursor}&includeRelationshipSummary=false${query}`
    ),
    { params: Promise.resolve({ wsId: 'ws-1' }) }
  );
}
