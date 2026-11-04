import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  own: false,
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
vi.mock('@tuturuuu/education-core/teach/api', () => ({
  requireTeachWorkspaceAccess: async () => ({
    normalizedWsId: 'workspace-a',
    sbAdmin: { from: state.from },
  }),
  validateTeachCourse: async () => ({ id: 'course' }),
}));

import { POST } from '../app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/attendance/route';

const userId = '00000000-0000-4000-8000-000000000001';
const courseId = '00000000-0000-4000-8000-000000000002';
beforeEach(() => {
  state.own = false;
  state.writes.mockReset();
  state.from.mockReset().mockImplementation((table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      in: () => query,
      upsert: () => {
        state.writes();
        return query;
      },
      delete: () => {
        state.writes();
        return query;
      },
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable.
      then: (resolve: (value: unknown) => void) =>
        resolve({
          data:
            table === 'workspace_user_groups_users' && state.own
              ? [{ user_id: userId }]
              : [],
          error: null,
        }),
    };
    return query;
  });
});
for (const status of ['PRESENT', 'NONE']) {
  it(`rejects an unassigned student before ${status} writes`, async () => {
    const response = await POST(
      new NextRequest('http://localhost/attendance', {
        method: 'POST',
        body: JSON.stringify([{ user_id: userId, status, date: '2026-10-26' }]),
      }),
      { params: { wsId: 'workspace-a', courseId } }
    );
    expect(response.status).toBe(404);
    expect(state.writes).not.toHaveBeenCalled();
  });
}
it('preserves assigned-student attendance', async () => {
  state.own = true;
  const response = await POST(
    new NextRequest('http://localhost/attendance', {
      method: 'POST',
      body: JSON.stringify([
        { user_id: userId, status: 'PRESENT', date: '2026-10-26' },
      ]),
    }),
    { params: { wsId: 'workspace-a', courseId } }
  );
  expect(response.status).toBe(200);
  expect(state.writes).toHaveBeenCalledOnce();
});
