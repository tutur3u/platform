import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  linked: false,
  from: vi.fn(),
  writes: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: NextRequest,
        context: unknown,
        params: unknown
      ) => unknown
    ) =>
    (request: NextRequest, route: { params: unknown }) =>
      handler(request, { user: { id: 'actor' }, supabase: {} }, route.params),
}));
vi.mock('@tuturuuu/education-core/tulearn/service', () => ({
  hasEducationEnabled: async () => true,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => 'workspace-a',
  getPermissions: async () => ({ containsPermission: () => true }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ from: state.from }),
}));

import { POST } from './route';

beforeEach(() => {
  state.linked = false;
  state.writes.mockReset();
  state.from.mockReset().mockImplementation((table: string) => {
    const filters: Record<string, string> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: string) => {
        filters[key] = value;
        return query;
      },
      maybeSingle: async () => ({
        error: null,
        data:
          table === 'workspace_users'
            ? { id: 'student' }
            : table === 'workspace_user_linked_users' &&
                state.linked &&
                filters.ws_id === 'workspace-a' &&
                filters.virtual_user_id ===
                  '00000000-0000-4000-8000-000000000001' &&
                filters.platform_user_id ===
                  '00000000-0000-4000-8000-000000000002'
              ? { platform_user_id: filters.platform_user_id }
              : null,
      }),
      insert: () => {
        state.writes();
        return query;
      },
      single: async () => ({ data: { id: 'link' }, error: null }),
    };
    return query;
  });
});
function createLink() {
  return POST(
    new NextRequest('http://localhost/parent-links', {
      method: 'POST',
      body: JSON.stringify({
        studentWorkspaceUserId: '00000000-0000-4000-8000-000000000001',
        studentPlatformUserId: '00000000-0000-4000-8000-000000000002',
        parentUserId: '00000000-0000-4000-8000-000000000003',
      }),
    }),
    { params: { wsId: 'workspace-a' } }
  );
}
it('rejects a platform identity not linked to the student in this workspace', async () => {
  expect((await createLink()).status).toBe(404);
  expect(state.writes).not.toHaveBeenCalled();
});
it('creates the link for the verified student identity', async () => {
  state.linked = true;
  expect((await createLink()).status).toBe(201);
  expect(state.writes).toHaveBeenCalledOnce();
});
