import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  calls: [] as [string, ...unknown[]][],
  rows: [] as unknown[],
  // Before the sprint migration lands, filtering on board_id fails.
  boardIdMissing: false,
}));

// A PostgREST-like builder that records its filters and resolves to `rows`.
function builder() {
  const query: Record<string, unknown> = {};
  let usesBoardId = false;
  for (const method of ['update', 'delete', 'eq', 'is', 'select']) {
    query[method] = (...args: unknown[]) => {
      state.calls.push([method, ...args]);
      if (method === 'is' && args[0] === 'board_id') usesBoardId = true;
      return query;
    };
  }
  const missing = () => state.boardIdMissing && usesBoardId;
  const error = { code: '42703', message: 'column board_id does not exist' };
  query.maybeSingle = async () =>
    missing()
      ? { data: null, error }
      : { data: state.rows[0] ?? null, error: null };
  // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable.
  query.then = (resolve: (value: unknown) => unknown) =>
    resolve(
      missing() ? { data: null, error } : { data: state.rows, error: null }
    );
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

import { DELETE, PUT } from './route';

const params = Promise.resolve({ wsId: 'ws-1', cycleId: 'sprint-1' });
const putRequest = () =>
  new NextRequest('http://localhost/api', {
    method: 'PUT',
    body: JSON.stringify({ name: 'Sprint 1', status: 'completed' }),
  });

describe('legacy task cycle routes', () => {
  beforeEach(() => {
    state.calls = [];
    state.rows = [];
    state.boardIdMissing = false;
  });

  it('cannot complete a board sprint, which only the sprint routes may end', async () => {
    const response = await PUT(putRequest(), { params });
    expect(response.status).toBe(404);
    expect(state.calls).toContainEqual(['is', 'board_id', null]);
  });

  it('cannot delete a board sprint', async () => {
    const response = await DELETE(new NextRequest('http://localhost/api'), {
      params,
    });
    expect(response.status).toBe(404);
    expect(state.calls).toContainEqual(['is', 'board_id', null]);
  });

  it('still updates and deletes workspace cycles', async () => {
    state.rows = [{ id: 'cycle-1', name: 'Cycle', task_cycle_tasks: [] }];
    expect((await PUT(putRequest(), { params })).status).toBe(200);
    expect(
      (await DELETE(new NextRequest('http://localhost/api'), { params })).status
    ).toBe(200);
  });

  it('keeps workspace cycles editable before the sprint migration lands', async () => {
    state.boardIdMissing = true;
    state.rows = [{ id: 'cycle-1', name: 'Cycle', task_cycle_tasks: [] }];
    expect((await PUT(putRequest(), { params })).status).toBe(200);
    expect(
      (await DELETE(new NextRequest('http://localhost/api'), { params })).status
    ).toBe(200);
  });
});
