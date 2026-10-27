import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  manager: false,
  from: vi.fn(),
  categoryWs: 'foreign',
  calls: [] as string[],
  mutations: [] as string[],
}));
vi.mock('@tuturuuu/hooks/utils/time-tracker-utils', () => ({
  getProjectContextCategory: vi.fn(),
  getTimeOfDayCategory: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ from: m.from }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => 'workspace',
  isPersonalWorkspace: async () => false,
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
  getPermissions: async () => ({
    containsPermission: () => m.manager,
    withoutPermission: () => !m.manager,
  }),
}));
vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: async () => 'workspace',
  getWorkspaceConfig: async () => 'true',
  isPersonalWorkspace: async () => false,
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: async () => ({
    ok: true,
    supabase: {},
    user: { id: 'actor' },
  }),
  withSessionAuth:
    (
      handler: (
        request: Request,
        auth: unknown,
        params: unknown
      ) => Promise<Response>
    ) =>
    async (request: Request, context: { params: Promise<unknown> }) =>
      handler(
        request,
        { supabase: {}, user: { id: 'actor' } },
        await context.params
      ),
}));
vi.mock('@/lib/time-tracking/workspace-access', () => ({
  resolveTimeTrackingWorkspaceAccess: async () => ({
    ok: true,
    normalizedWsId: 'workspace',
  }),
}));

import { handleEditAction } from './sessions/[sessionId]/actions/edit';
import { GET, POST } from './sessions/route';

const categoryId = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  vi.clearAllMocks();
  m.manager = false;
  m.categoryWs = 'foreign';
  m.calls = [];
  m.mutations = [];
  m.from.mockImplementation((table: string) => {
    m.calls.push(table);
    const result = {
      data:
        table === 'time_tracking_categories'
          ? m.categoryWs === 'workspace'
            ? { id: categoryId, ws_id: 'workspace' }
            : null
          : table === 'time_tracking_sessions'
            ? { id: 'session', is_running: true }
            : [],
      error: null,
      count: 0,
    };
    const q = Object.assign(Promise.resolve(result), {
      select: () => q,
      eq: () => q,
      is: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: () =>
        Promise.resolve(
          table === 'time_tracking_sessions'
            ? { ...result, data: null }
            : result
        ),
      single: () => Promise.resolve(result),
      update: () => {
        m.mutations.push(table);
        return q;
      },
      insert: () => {
        m.mutations.push(table);
        return q;
      },
    });
    return q;
  });
});
describe('session category workspace boundary', () => {
  it('rejects a foreign category before creating or stopping sessions', async () => {
    const response = await POST(
      new NextRequest('https://example.test', {
        method: 'POST',
        body: JSON.stringify({ title: 'Timer', categoryId }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: Promise.resolve({ wsId: 'workspace' }) }
    );
    expect(response.status).toBe(400);
    expect(m.mutations).toEqual([]);
  });
  it('rejects a foreign category before editing a session', async () => {
    const response = await handleEditAction({
      sbAdmin: { from: m.from } as never,
      session: {
        id: 'session',
        is_running: true,
        start_time: '2026-01-01T00:00:00Z',
        user_id: 'actor',
      } as never,
      sessionId: 'session',
      normalizedWsId: 'workspace',
      canBypass: false,
      requestBody: { action: 'edit', categoryId },
    });
    expect(response.status).toBe(400);
    expect(m.mutations).toEqual([]);
  });
  it('allows editing a category in the session workspace', async () => {
    m.categoryWs = 'workspace';
    const response = await handleEditAction({
      sbAdmin: { from: m.from } as never,
      session: {
        id: 'session',
        is_running: true,
        start_time: '2026-01-01T00:00:00Z',
        user_id: 'actor',
      } as never,
      sessionId: 'session',
      normalizedWsId: 'workspace',
      canBypass: false,
      requestBody: { action: 'edit', categoryId },
    });
    expect(response.status).toBe(200);
    expect(m.mutations).toContain('time_tracking_sessions');
  });
});

import { GET as goals } from './goals/route';

describe.each([
  ['sessions', GET],
  ['goals', goals],
] as const)('%s cross-user reads', (_, handler) => {
  it('denies another user without request management permission', async () => {
    expect(
      (
        await handler(
          new NextRequest('https://example.test/?type=running&userId=other'),
          { params: Promise.resolve({ wsId: 'workspace' }) }
        )
      ).status
    ).toBe(403);
    expect(m.from).not.toHaveBeenCalled();
  });
  it('preserves self reads', async () => {
    expect(
      (
        await handler(new NextRequest('https://example.test/?type=running'), {
          params: Promise.resolve({ wsId: 'workspace' }),
        })
      ).status
    ).toBe(200);
  });
  it('preserves permitted cross-user reads', async () => {
    m.manager = true;
    expect(
      (
        await handler(
          new NextRequest('https://example.test/?type=running&userId=other'),
          { params: Promise.resolve({ wsId: 'workspace' }) }
        )
      ).status
    ).toBe(200);
  });
});
