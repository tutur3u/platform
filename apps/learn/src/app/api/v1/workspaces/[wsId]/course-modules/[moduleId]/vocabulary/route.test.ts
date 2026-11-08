import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  allowed: false,
  detail: vi.fn(),
  subject: vi.fn(),
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  attachSupabaseAuthUser: (client: unknown) => client,
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: async () => ({ id: 'student' }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => 'workspace-a',
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
  getPermissions: async () => ({ containsPermission: () => false }),
}));
vi.mock('@tuturuuu/education-core/tulearn/service', () => ({
  resolveTulearnSubject: state.subject,
  getLearnerModuleDetail: state.detail,
  tulearnAccessErrorResponse: () => null,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: {
            id: 'module',
            group_id: 'course',
            vocabulary: [{ id: 'word', word: 'word', definition: 'meaning' }],
          },
          error: null,
        }),
      };
      return query;
    },
  }),
}));

import { GET } from './route';

beforeEach(() => {
  state.detail.mockReset().mockResolvedValue(null);
  state.subject.mockReset().mockResolvedValue({
    wsId: 'workspace-a',
    studentPlatformUserId: 'student',
    studentWorkspaceUserId: 'virtual',
  });
});
function read() {
  return GET(new NextRequest('http://localhost/vocabulary'), {
    params: { wsId: 'workspace-a', moduleId: 'module' },
  });
}
it('denies vocabulary from a module the learner cannot open', async () => {
  expect((await read()).status).toBe(404);
});
it('preserves vocabulary for an assigned published module', async () => {
  state.detail.mockResolvedValue({ id: 'module' });
  const response = await read();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    vocabulary: [{ word: 'word', definition: 'meaning' }],
  });
});
