import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const membershipMaybeSingle = vi.fn();
  const normalizeWorkspaceId = vi.fn();
  const courseMaybeSingle = vi.fn();
  const listModulesEq = vi.fn();
  const updateEqId = vi.fn();
  const updateEqCourse = vi.fn();

  const sessionSupabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: membershipMaybeSingle,
          })),
        })),
      })),
    })),
  };

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_user_groups') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: courseMaybeSingle,
              })),
            })),
          })),
        };
      }

      if (table === 'workspace_course_modules') {
        return {
          select: vi.fn(() => ({
            eq: listModulesEq,
          })),
          update: vi.fn(() => ({
            eq: updateEqId,
          })),
        };
      }

      return { select: vi.fn() };
    }),
  };

  return {
    adminSupabase,
    courseMaybeSingle,
    listModulesEq,
    membershipMaybeSingle,
    normalizeWorkspaceId,
    sessionSupabase,
    updateEqCourse,
    updateEqId,
  };
});

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: unknown) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<unknown> }
    ) =>
      (
        handler as (
          request: NextRequest,
          context: {
            user: { id: string };
            supabase: typeof mocks.sessionSupabase;
          },
          params: { courseId: string; wsId: string }
        ) => Promise<Response>
      )(
        request,
        { user: { id: 'user-1' }, supabase: mocks.sessionSupabase },
        (await routeContext?.params) as { courseId: string; wsId: string }
      ),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
}));

describe('module order route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue(
      '00000000-0000-0000-0000-000000000001'
    );
    mocks.membershipMaybeSingle.mockResolvedValue({
      data: { user_id: 'user-1' },
      error: null,
    });
    mocks.courseMaybeSingle.mockResolvedValue({
      data: { id: 'course-1' },
      error: null,
    });
    mocks.listModulesEq.mockResolvedValue({
      data: [
        { id: '11111111-1111-4111-8111-111111111111' },
        { id: '22222222-2222-4222-8222-222222222222' },
      ],
      error: null,
    });
    mocks.updateEqCourse.mockResolvedValue({ data: null, error: null });
    mocks.updateEqId.mockReturnValue({
      eq: mocks.updateEqCourse,
    });
  });

  it('returns 400 when module ids are duplicated', async () => {
    const { PATCH } = await import(
      '@/app/api/v1/workspaces/[wsId]/courses/[courseId]/module-order/route'
    );

    const response = await PATCH(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/courses/course-1/module-order',
        {
          method: 'PATCH',
          body: JSON.stringify({
            moduleIds: [
              '11111111-1111-4111-8111-111111111111',
              '11111111-1111-4111-8111-111111111111',
            ],
          }),
        }
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1', courseId: 'course-1' }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Module IDs must be unique',
    });
  });

  it('persists sort_key updates for ordered modules', async () => {
    const { PATCH } = await import(
      '@/app/api/v1/workspaces/[wsId]/courses/[courseId]/module-order/route'
    );

    const response = await PATCH(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/courses/course-1/module-order',
        {
          method: 'PATCH',
          body: JSON.stringify({
            moduleIds: [
              '22222222-2222-4222-8222-222222222222',
              '11111111-1111-4111-8111-111111111111',
            ],
          }),
        }
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1', courseId: 'course-1' }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(mocks.updateEqId).toHaveBeenCalledTimes(2);
  });
});
