import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TASK_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';

const m = vi.hoisted(() => ({
  taskWsId: null as string | null,
  categoryFound: false,
  lookupError: null as string | null,
  filters: [] as [string, unknown][],
  inserts: [] as unknown[],
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
  getPermissions: async () => ({ containsPermission: () => false }),
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: async () => ({
    ok: true,
    user: { id: 'actor' },
    supabase: {},
  }),
}));
vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: async () => 'workspace',
  getWorkspaceConfig: async () => 'true',
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicClient: async () => ({}),
  createAdminClient: async () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: (column: string, value: unknown) => {
          m.filters.push([`${table}.${column}`, value]);
          return q;
        },
        maybeSingle: async () => {
          if (m.lookupError)
            return { data: null, error: { message: m.lookupError } };
          if (table === 'tasks')
            return {
              data: m.taskWsId
                ? {
                    id: TASK_ID,
                    task_lists: { workspace_boards: { ws_id: m.taskWsId } },
                  }
                : null,
              error: null,
            };
          return {
            data: m.categoryFound ? { id: CATEGORY_ID } : null,
            error: null,
          };
        },
      };
      return q;
    },
    schema: () => ({
      from: () => ({
        insert: (row: unknown) => {
          m.inserts.push(row);
          const result = { data: [row], error: null };
          return { select: () => Promise.resolve(result) };
        },
      }),
    }),
  }),
}));

import { POST } from './route';

const post = (refs: { taskId?: string; categoryId?: string }) =>
  POST(
    new NextRequest(
      'http://localhost/api/v1/workspaces/ws/time-tracking/requests',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Missed time',
          startTime: '2026-01-01T09:00:00.000Z',
          endTime: '2026-01-01T10:00:00.000Z',
          ...refs,
        }),
      }
    ),
    { params: Promise.resolve({ wsId: 'ws' }) }
  );

describe('time tracking request task and category references', () => {
  beforeEach(() => {
    m.taskWsId = null;
    m.categoryFound = false;
    m.lookupError = null;
    m.filters = [];
    m.inserts = [];
  });

  it('rejects a task from another workspace before writing', async () => {
    m.taskWsId = 'other-workspace';
    const response = await post({ taskId: TASK_ID });
    expect(response.status).toBe(400);
    expect(m.inserts).toEqual([]);
  });

  it('rejects an unknown task before writing', async () => {
    const response = await post({ taskId: TASK_ID });
    expect(response.status).toBe(400);
    expect(m.inserts).toEqual([]);
  });

  it('rejects a category outside the workspace before writing', async () => {
    const response = await post({ categoryId: CATEGORY_ID });
    expect(response.status).toBe(400);
    expect(m.inserts).toEqual([]);
    expect(m.filters).toEqual(
      expect.arrayContaining([
        ['time_tracking_categories.id', CATEGORY_ID],
        ['time_tracking_categories.ws_id', 'workspace'],
      ])
    );
  });

  it('rejects a malformed category id without a lookup', async () => {
    const response = await post({ categoryId: 'not-a-uuid' });
    expect(response.status).toBe(400);
    expect(m.filters).toEqual([]);
    expect(m.inserts).toEqual([]);
  });

  it('returns 500 before writing when a lookup fails', async () => {
    m.lookupError = 'Unavailable';
    for (const refs of [{ taskId: TASK_ID }, { categoryId: CATEGORY_ID }]) {
      const response = await post(refs);
      expect(response.status).toBe(500);
    }
    expect(m.inserts).toEqual([]);
  });

  it('stores a same-workspace task and category', async () => {
    m.taskWsId = 'workspace';
    m.categoryFound = true;
    const response = await post({ taskId: TASK_ID, categoryId: CATEGORY_ID });
    expect(response.status).toBe(201);
    expect(m.inserts).toEqual([
      expect.objectContaining({
        workspace_id: 'workspace',
        task_id: TASK_ID,
        category_id: CATEGORY_ID,
      }),
    ]);
  });

  it('does not look anything up when no task or category is given', async () => {
    const response = await post({});
    expect(response.status).toBe(201);
    expect(m.filters).toEqual([]);
  });
});
