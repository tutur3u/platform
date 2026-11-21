import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  containsPermission: vi.fn(),
  resolveTaskProgressRouteAuth: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPermissions: vi.fn(async () => ({
    containsPermission: mocks.containsPermission,
  })),
}));

vi.mock('../../_utils', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hydrateGoalsWithProgress: vi.fn(
    async (_auth: unknown, goals: unknown[]) => goals
  ),
  resolveTaskProgressRouteAuth: mocks.resolveTaskProgressRouteAuth,
  validateTaskProgressScope: vi.fn(async () => ({ ok: true })),
}));

import { DELETE, PATCH } from './route';

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const MEMBER = '00000000-0000-4000-8000-0000000000b1';
const GOAL = '00000000-0000-4000-8000-0000000000c1';

function adminClient() {
  const writes: { match: unknown; update: unknown }[] = [];
  const client = {
    from: vi.fn(() => {
      const state: { update?: unknown; match?: unknown } = {};
      const query: Record<string, unknown> = {};
      Object.assign(query, {
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        match: vi.fn((filter: unknown) => {
          state.match = filter;
          return query;
        }),
        maybeSingle: vi.fn(async () => {
          if (state.update === undefined) {
            return { data: { id: GOAL, owner_id: OWNER }, error: null };
          }
          writes.push({ match: state.match, update: state.update });
          return { data: { id: GOAL, owner_id: OWNER }, error: null };
        }),
        select: vi.fn(() => query),
        update: vi.fn((body: unknown) => {
          state.update = body;
          return query;
        }),
      });
      return query;
    }),
  };
  return { client, writes };
}

function request(method: string, body?: unknown) {
  return new NextRequest(
    `https://tasks.test/api/v1/workspaces/ws-1/task-progress/goals/${GOAL}`,
    { body: body ? JSON.stringify(body) : undefined, method }
  );
}

const context = { params: Promise.resolve({ goalId: GOAL, wsId: 'ws-1' }) };

function signIn(userId: string) {
  const admin = adminClient();
  mocks.resolveTaskProgressRouteAuth.mockResolvedValue({
    sbAdmin: admin.client,
    supabase: {},
    user: { id: userId },
    wsId: 'ws-1',
  });
  return admin;
}

describe('task progress goal ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.containsPermission.mockReturnValue(false);
  });

  it('refuses another member archiving the goal', async () => {
    const admin = signIn(MEMBER);
    const response = await DELETE(request('DELETE'), context);

    expect(response?.status).toBe(403);
    expect(admin.writes).toEqual([]);
  });

  it('refuses another member editing the goal', async () => {
    const admin = signIn(MEMBER);
    const response = await PATCH(request('PATCH', { name: 'Taken' }), context);

    expect(response?.status).toBe(403);
    expect(admin.writes).toEqual([]);
  });

  it('lets the owner archive the goal with the owner filter on the write', async () => {
    const admin = signIn(OWNER);
    const response = await DELETE(request('DELETE'), context);

    expect(response?.status).toBe(200);
    expect(admin.writes).toEqual([
      {
        match: { owner_id: OWNER },
        update: expect.objectContaining({ status: 'archived' }),
      },
    ]);
  });

  it('lets a Tasks manager edit another member goal', async () => {
    mocks.containsPermission.mockReturnValue(true);
    const admin = signIn(MEMBER);
    const response = await PATCH(
      request('PATCH', { name: 'Renamed' }),
      context
    );

    expect(response?.status).toBe(200);
    expect(mocks.containsPermission).toHaveBeenCalledWith('manage_projects');
    expect(admin.writes).toEqual([
      { match: {}, update: expect.objectContaining({ name: 'Renamed' }) },
    ]);
  });
});
