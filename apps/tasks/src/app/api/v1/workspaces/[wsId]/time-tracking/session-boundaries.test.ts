import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  manager: false,
  from: vi.fn(),
  categoryWs: 'foreign',
  calls: [] as string[],
  mutations: [] as string[],
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

import { POST } from './sessions/route';

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
      maybeSingle: () => Promise.resolve(result),
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
});
